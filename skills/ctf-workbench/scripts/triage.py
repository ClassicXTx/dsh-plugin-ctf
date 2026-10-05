"""Read-only CTF file metadata. Never extracts archives or executes input files."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import struct
import sys
import zipfile

import dpkt
from elftools.elf.elffile import ELFFile

PCAP_MAGIC = {b"\xd4\xc3\xb2\xa1": "<", b"\xa1\xb2\xc3\xd4": ">",
              b"\x4d\x3c\xb2\xa1": "<", b"\xa1\xb2\x3c\x4d": ">"}
SHB_MAGIC = b"\x0a\x0d\x0d\x0a"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def unsafe_path(name):
    normalized = name.replace("\\", "/")
    parts = PurePosixPath(normalized).parts
    return (normalized.startswith("/") or ".." in parts
            or bool(re.match(r"^[A-Za-z]:", normalized)))


def zip_metadata(stream):
    with zipfile.ZipFile(stream) as archive:
        members = [{"name": item.filename, "size": item.file_size,
                    "compressed_size": item.compress_size,
                    "encrypted": bool(item.flag_bits & 1),
                    "unsafe_path": unsafe_path(item.filename)}
                   for item in archive.infolist()]
    return {"member_count": len(members), "total_size": sum(x["size"] for x in members),
            "total_compressed_size": sum(x["compressed_size"] for x in members),
            "encrypted": any(x["encrypted"] for x in members),
            "unsafe_paths": any(x["unsafe_path"] for x in members), "members": members}


def elf_metadata(stream):
    elf = ELFFile(stream)
    segments = list(elf.iter_segments())
    stack = next((x for x in segments if x["p_type"] == "PT_GNU_STACK"), None)
    relro = any(x["p_type"] == "PT_GNU_RELRO" for x in segments)
    now = False
    for segment in segments:
        if segment["p_type"] == "PT_DYNAMIC":
            for tag in segment.iter_tags():
                kind = tag.entry.d_tag
                now |= (kind == "DT_BIND_NOW"
                        or (kind == "DT_FLAGS" and bool(tag.entry.d_val & 8))
                        or (kind == "DT_FLAGS_1" and bool(tag.entry.d_val & 1)))
    flags = int(stack["p_flags"]) if stack is not None else None
    return {"class_bits": elf.elfclass, "endianness": "little" if elf.little_endian else "big",
            "machine": elf["e_machine"], "type": elf["e_type"], "entry": elf["e_entry"],
            "gnu_stack": {"flags": flags, "executable": bool(flags & 1) if flags is not None else None},
            "relro": "full" if relro and now else "partial" if relro else "none"}


def pcap_metadata(stream, size, magic):
    reader = dpkt.pcap.Reader(stream)
    link_type = reader.datalink()
    packets = 0
    # dpkt's iterator accepts a short final packet payload; check framing explicitly.
    while stream.tell() < size:
        header = stream.read(16)
        require(len(header) == 16, "Truncated PCAP packet header")
        _, _, captured, original = struct.unpack(PCAP_MAGIC[magic] + "IIII", header)
        require(captured <= original and captured <= size - stream.tell(), "Invalid PCAP packet length")
        stream.seek(captured, 1)
        packets += 1
    return {"packet_count": packets, "link_types": [link_type]}


def pcapng_metadata(stream, size):
    endian, interfaces, links, packets = None, [], set(), 0
    while stream.tell() < size:
        prefix = stream.read(12)
        require(len(prefix) == 12, "Truncated PCAPNG block header")
        if prefix[:4] == SHB_MAGIC:
            endian = {b"\x4d\x3c\x2b\x1a": "<", b"\x1a\x2b\x3c\x4d": ">"}.get(prefix[8:12])
            require(endian is not None, "Invalid PCAPNG byte-order magic")
            interfaces = []
        require(endian is not None, "PCAPNG requires a section header")
        kind, length = struct.unpack(endian + "II", prefix[:8])
        require(length >= 12 and length % 4 == 0 and length - 12 <= size - stream.tell(), "Invalid PCAPNG block length")
        block = prefix + stream.read(length - 12)
        require(struct.unpack(endian + "I", block[-4:])[0] == length, "PCAPNG block lengths disagree")
        suffix = "LE" if endian == "<" else ""
        if kind == dpkt.pcapng.PCAPNG_BT_SHB:
            section = getattr(dpkt.pcapng, "SectionHeaderBlock" + suffix)(block)
            require(section.v_major == 1, "Unsupported PCAPNG section version")
        elif kind == dpkt.pcapng.PCAPNG_BT_IDB:
            interface = getattr(dpkt.pcapng, "InterfaceDescriptionBlock" + suffix)(block)
            interfaces.append(interface)
            links.add(interface.linktype)
        elif kind in (dpkt.pcapng.PCAPNG_BT_EPB, dpkt.pcapng.PCAPNG_BT_PB):
            cls = "EnhancedPacketBlock" if kind == dpkt.pcapng.PCAPNG_BT_EPB else "PacketBlock"
            packet = getattr(dpkt.pcapng, cls + suffix)(block)
            require(packet.iface_id < len(interfaces), "PCAPNG packet references missing interface")
            require(packet.caplen <= packet.pkt_len and packet.caplen <= length - 32, "Invalid PCAPNG captured length")
            packets += 1
        elif kind == dpkt.pcapng.PCAPNG_BT_SPB:
            require(bool(interfaces) and length >= 16, "Invalid PCAPNG simple packet")
            original = struct.unpack(endian + "I", block[8:12])[0]
            captured = min(original, interfaces[0].snaplen or original)
            require(length == 16 + ((captured + 3) // 4) * 4, "Invalid PCAPNG simple packet length")
            packets += 1
    return {"packet_count": packets, "link_types": sorted(links) or None}


def inspect_file(source):
    result = {"ok": False, "file": str(source), "size": None, "sha256": None, "format": None, "metadata": None}
    try:
        require(source.is_file(), "Input must be one regular file")
        with source.open("rb") as stream:
            digest = hashlib.sha256()
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
            result.update(size=stream.tell(), sha256=digest.hexdigest())
            stream.seek(0)
            magic = stream.read(4)
            stream.seek(0)
            if magic == b"\x7fELF":
                kind, parser = "ELF", elf_metadata
            elif magic in PCAP_MAGIC:
                kind, parser = "PCAP", lambda f: pcap_metadata(f, result["size"], magic)
            elif magic == SHB_MAGIC:
                kind, parser = "PCAPNG", lambda f: pcapng_metadata(f, result["size"])
            elif magic in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08") or zipfile.is_zipfile(stream):
                kind, parser = "ZIP", zip_metadata
            else:
                kind, parser = "unknown", lambda f: None
            result["format"] = kind
            stream.seek(0)
            result.update(metadata=parser(stream), ok=True)
    except Exception as error:
        result["error"] = {"type": type(error).__name__, "message": str(error)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, help="Also save JSON; must differ from the input")
    args = parser.parse_args()
    result = inspect_file(args.input.resolve())
    try:
        if args.output is not None:
            source, output = args.input.resolve(), args.output.resolve()
            require(output != source and not (output.exists() and source.exists() and output.samefile(source)), "Output must not overwrite input")
            output.write_text(json.dumps(result, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    except Exception as error:
        result.update(ok=False, error={"type": type(error).__name__, "message": str(error)})
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
