# Generates the two showroom demo bank-QR plates shown in every template's
# wedding-gift modal. Usage:
#   python3 lib/showroom/demo/generate-demo-qr-images.py public/showroom/demo
#
# The symbols are real, standards-conformant QR codes (version 3, error
# correction level M, byte mode) that encode nothing but a plain-text line
# saying this is a WeddingClick sample card. They are NOT payment codes: the
# demo couple's bank is the openly fictional "Ngan hang Demo (thiep mau)" with
# account numbers 0000000001 / 0000000002, so a guest who scans one reads a
# sentence and can transfer nothing. See ASSETS.md.
#
# Deterministic: no randomness, no network, no current time. Re-running
# reproduces the same bytes on the same Pillow version. The encoder is
# self-contained so the repository gains no dependency for a build-time
# script, and it self-checks every symbol it writes (see `verify`).
import os
import sys

from PIL import Image

# --- GF(256) for Reed-Solomon, primitive polynomial 0x11D -------------------

EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def gf_mul(a, b):
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]


def rs_generator(degree):
    """Product of (x - a^i) for i in 0..degree-1, highest power first."""
    poly = [1]
    for i in range(degree):
        product = [0] * (len(poly) + 1)
        for j, coefficient in enumerate(poly):
            product[j] ^= coefficient  # x * poly
            product[j + 1] ^= gf_mul(coefficient, EXP[i])  # a^i * poly
        poly = product
    return poly


def rs_remainder(data, degree):
    """The `degree` error-correction codewords for `data`."""
    gen = rs_generator(degree)
    remainder = list(data) + [0] * degree
    for i in range(len(data)):
        factor = remainder[i]
        if factor == 0:
            continue
        for j, coefficient in enumerate(gen):
            remainder[i + j] ^= gf_mul(coefficient, factor)
    return remainder[len(data):]


# --- Version 3, level M ----------------------------------------------------
# One block: 44 data codewords + 26 error-correction codewords = 70 total,
# so no interleaving is needed. 29x29 modules, one alignment pattern.

VERSION = 3
SIZE = 17 + 4 * VERSION
DATA_CODEWORDS = 44
EC_CODEWORDS = 26
ALIGN_CENTER = SIZE - 7  # (22, 22): versions 2-6 carry exactly one
DARK_MODULE = (SIZE - 8, 8)  # (21, 8)
ECC_LEVEL_BITS = 0b00  # M


def encode_codewords(payload):
    data = payload.encode("ascii")
    if len(data) > DATA_CODEWORDS - 2:
        raise ValueError("demo QR payload does not fit version 3-M byte mode")
    bits = []

    def push(value, width):
        for shift in range(width - 1, -1, -1):
            bits.append((value >> shift) & 1)

    push(0b0100, 4)  # byte mode
    push(len(data), 8)  # count indicator, 8 bits for versions 1-9
    for byte in data:
        push(byte, 8)
    push(0, min(4, DATA_CODEWORDS * 8 - len(bits)))  # terminator
    while len(bits) % 8:
        bits.append(0)
    codewords = [int("".join(str(bit) for bit in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]
    # Pad codewords alternate 0xEC, 0x11 and always start at 0xEC.
    codewords += [0xEC if i % 2 == 0 else 0x11 for i in range(DATA_CODEWORDS - len(codewords))]
    return codewords + rs_remainder(codewords, EC_CODEWORDS)


def function_module_map():
    """True where a module is a function pattern and carries no data."""
    reserved = [[False] * SIZE for _ in range(SIZE)]

    def block(r0, c0, rows, cols):
        for r in range(r0, r0 + rows):
            for c in range(c0, c0 + cols):
                if 0 <= r < SIZE and 0 <= c < SIZE:
                    reserved[r][c] = True

    # Finder patterns with their separators, as 8x8 corner blocks.
    block(0, 0, 8, 8)
    block(0, SIZE - 8, 8, 8)
    block(SIZE - 8, 0, 8, 8)
    # Timing patterns.
    for i in range(SIZE):
        reserved[6][i] = True
        reserved[i][6] = True
    # The single alignment pattern.
    block(ALIGN_CENTER - 2, ALIGN_CENTER - 2, 5, 5)
    # Format information (both copies) and the dark module.
    for i in range(9):
        reserved[8][i] = True
        reserved[i][8] = True
    for i in range(8):
        reserved[8][SIZE - 1 - i] = True
        reserved[SIZE - 1 - i][8] = True
    return reserved


def draw_function_patterns(modules):
    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if not (0 <= rr < SIZE and 0 <= cc < SIZE):
                    continue
                edge = max(abs(r - 3), abs(c - 3))
                modules[rr][cc] = 1 if edge in (0, 1, 3) else 0

    finder(0, 0)
    finder(0, SIZE - 7)
    finder(SIZE - 7, 0)
    # Timing patterns span only between the separators; writing them across the
    # whole row and column would overwrite the finder patterns' own edges.
    for i in range(8, SIZE - 8):
        bit = 1 if i % 2 == 0 else 0
        modules[6][i] = bit
        modules[i][6] = bit
    for r in range(-2, 3):
        for c in range(-2, 3):
            edge = max(abs(r), abs(c))
            modules[ALIGN_CENTER + r][ALIGN_CENTER + c] = 1 if edge != 1 else 0
    modules[DARK_MODULE[0]][DARK_MODULE[1]] = 1


def data_module_positions(reserved):
    """The zigzag order the standard places data bits in."""
    positions = []
    upward = True
    col = SIZE - 1
    while col > 0:
        if col == 6:  # skip the vertical timing pattern
            col -= 1
        rows = range(SIZE - 1, -1, -1) if upward else range(SIZE)
        for row in rows:
            for c in (col, col - 1):
                if not reserved[row][c]:
                    positions.append((row, c))
        upward = not upward
        col -= 2
    return positions


MASKS = (
    lambda i, j: (i + j) % 2 == 0,
    lambda i, j: i % 2 == 0,
    lambda i, j: j % 3 == 0,
    lambda i, j: (i + j) % 3 == 0,
    lambda i, j: (i // 2 + j // 3) % 2 == 0,
    lambda i, j: (i * j) % 2 + (i * j) % 3 == 0,
    lambda i, j: ((i * j) % 2 + (i * j) % 3) % 2 == 0,
    lambda i, j: ((i + j) % 2 + (i * j) % 3) % 2 == 0,
)

FINDER_RUN = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0]


def penalty(modules):
    total = 0
    # Rule 1: runs of five or more.
    for line in list(modules) + [list(col) for col in zip(*modules)]:
        run, previous = 1, line[0]
        for value in line[1:]:
            if value == previous:
                run += 1
            else:
                if run >= 5:
                    total += 3 + (run - 5)
                run, previous = 1, value
        if run >= 5:
            total += 3 + (run - 5)
    # Rule 2: 2x2 blocks of one colour.
    for r in range(SIZE - 1):
        for c in range(SIZE - 1):
            value = modules[r][c]
            if modules[r][c + 1] == value and modules[r + 1][c] == value and modules[r + 1][c + 1] == value:
                total += 3
    # Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
    for line in list(modules) + [list(col) for col in zip(*modules)]:
        for i in range(SIZE - 10):
            window = line[i:i + 11]
            if window == FINDER_RUN or window == FINDER_RUN[::-1]:
                total += 40
    # Rule 4: deviation from an even light/dark balance.
    dark = sum(sum(row) for row in modules)
    percent = dark * 100 / (SIZE * SIZE)
    total += 10 * int(abs(percent - 50) / 5)
    return total


def format_bits(mask):
    value = (ECC_LEVEL_BITS << 3) | mask
    # BCH(15,5): remainder of value<<10 modulo the generator 0b10100110111.
    remainder = value << 10
    while remainder.bit_length() > 10:
        remainder ^= 0b10100110111 << (remainder.bit_length() - 11)
    return ((value << 10) | remainder) ^ 0b101010000010010


def place_format(modules, mask):
    bits = format_bits(mask)
    get = lambda n: (bits >> n) & 1
    # First copy: up column 8 (skipping the timing row), then left along row 8
    # (skipping the timing column). Second copy: row 8 on the right, column 8
    # at the bottom, above the always-dark module.
    for i in range(6):
        modules[i][8] = get(i)
    modules[7][8] = get(6)
    modules[8][8] = get(7)
    modules[8][7] = get(8)
    for i in range(9, 15):
        modules[8][14 - i] = get(i)
    for i in range(8):
        modules[8][SIZE - 1 - i] = get(i)
    for i in range(8, 15):
        modules[SIZE - 15 + i][8] = get(i)


def build_symbol(payload):
    codewords = encode_codewords(payload)
    reserved = function_module_map()
    positions = data_module_positions(reserved)
    bits = [(codewords[i // 8] >> (7 - i % 8)) & 1 for i in range(len(codewords) * 8)]
    # Version 3 leaves seven remainder bits over the 70 codewords; the standard
    # places them as zeroes and masks them like any other data module.
    remainder_bits = len(positions) - len(bits)
    if remainder_bits != 7:
        raise ValueError("demo QR data capacity does not match the module count")
    bits += [0] * remainder_bits

    best = None
    for mask, predicate in enumerate(MASKS):
        modules = [[0] * SIZE for _ in range(SIZE)]
        draw_function_patterns(modules)
        for (row, col), bit in zip(positions, bits):
            modules[row][col] = bit ^ (1 if predicate(row, col) else 0)
        place_format(modules, mask)
        score = penalty(modules)
        if best is None or score < best[0]:
            best = (score, mask, modules)
    return best[2], best[1], positions, reserved


def verify(modules, mask, positions, payload):
    """Reads the finished symbol back: format bits, RS integrity, payload."""
    # Read the SECOND copy, so a transposed first copy cannot verify itself.
    second = sum(modules[8][SIZE - 1 - i] << i for i in range(8)) | sum(
        modules[SIZE - 15 + i][8] << i for i in range(8, 15)
    )
    if format_bits(mask) != second:
        raise AssertionError("demo QR format information does not round-trip")
    if modules[DARK_MODULE[0]][DARK_MODULE[1]] != 1:
        raise AssertionError("demo QR is missing its always-dark module")
    predicate = MASKS[mask]
    total = (DATA_CODEWORDS + EC_CODEWORDS) * 8
    bits = [modules[row][col] ^ (1 if predicate(row, col) else 0) for row, col in positions][:total]
    codewords = [int("".join(str(bit) for bit in bits[i:i + 8]), 2) for i in range(0, total, 8)]
    # QR's generator has roots a^0 .. a^25, so a valid codeword vanishes there.
    for power in range(EC_CODEWORDS):
        syndrome = 0
        for coefficient in codewords:
            syndrome = gf_mul(syndrome, EXP[power]) ^ coefficient
        if syndrome != 0:
            raise AssertionError("demo QR is not a valid Reed-Solomon codeword")
    if codewords[0] >> 4 != 0b0100:
        raise AssertionError("demo QR mode indicator is not byte mode")
    length = ((codewords[0] & 0x0F) << 4) | (codewords[1] >> 4)
    decoded = bytes(
        ((codewords[1 + i] & 0x0F) << 4) | (codewords[2 + i] >> 4) for i in range(length)
    )
    if decoded.decode("ascii") != payload:
        raise AssertionError("demo QR payload does not round-trip")


# Plate geometry: 600 px square covers a 196 px plate at device pixel ratio 3,
# the largest the certified templates draw. Quiet zone is the required four
# modules. Near-black on white, like a real bank QR, so one asset suits the
# ivory, blush, champagne and lacquer palettes alike.
PLATE = 600
QUIET = 4
INK = (26, 23, 20)
PAPER = (255, 255, 255)

PLATES = (
    ("qr-demo-nha-trai.webp", "WEDDINGCLICK THIEP MAU - NHA TRAI"),
    ("qr-demo-nha-gai.webp", "WEDDINGCLICK THIEP MAU - NHA GAI"),
)


def render(payload):
    modules, mask, positions, _ = build_symbol(payload)
    verify(modules, mask, positions, payload)
    span = SIZE + QUIET * 2
    small = Image.new("RGB", (span, span), PAPER)
    for row in range(SIZE):
        for col in range(SIZE):
            if modules[row][col]:
                small.putpixel((col + QUIET, row + QUIET), INK)
    # Nearest-neighbour keeps every module edge exact; 600 is not a multiple of
    # 37, so scale to a multiple first and then pad symmetrically.
    scale = PLATE // span
    crisp = small.resize((span * scale, span * scale), Image.NEAREST)
    plate = Image.new("RGB", (PLATE, PLATE), PAPER)
    offset = (PLATE - span * scale) // 2
    plate.paste(crisp, (offset, offset))
    return plate, mask


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "public/showroom/demo"
    os.makedirs(out, exist_ok=True)
    for name, payload in PLATES:
        plate, mask = render(payload)
        path = os.path.join(out, name)
        plate.save(path, "WEBP", lossless=True, quality=100, method=6)
        print(f"{name}: version {VERSION}-M, mask {mask}, {PLATE}x{PLATE}, payload {payload!r}")


if __name__ == "__main__":
    main()
