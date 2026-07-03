type QrOptions = {
  border?: number;
  foreground?: string;
  background?: string;
};

type QrVersionInfo = {
  rawCodewords: number;
  dataCodewords: number;
  eccCodewordsPerBlock: number;
  blocks: number;
  alignment: number[];
};

const VERSIONS: QrVersionInfo[] = [
  { rawCodewords: 26, dataCodewords: 19, eccCodewordsPerBlock: 7, blocks: 1, alignment: [] },
  { rawCodewords: 44, dataCodewords: 34, eccCodewordsPerBlock: 10, blocks: 1, alignment: [6, 18] },
  { rawCodewords: 70, dataCodewords: 55, eccCodewordsPerBlock: 15, blocks: 1, alignment: [6, 22] },
  { rawCodewords: 100, dataCodewords: 80, eccCodewordsPerBlock: 20, blocks: 1, alignment: [6, 26] },
  { rawCodewords: 134, dataCodewords: 108, eccCodewordsPerBlock: 26, blocks: 1, alignment: [6, 30] },
  { rawCodewords: 172, dataCodewords: 136, eccCodewordsPerBlock: 18, blocks: 2, alignment: [6, 34] },
  { rawCodewords: 196, dataCodewords: 156, eccCodewordsPerBlock: 20, blocks: 2, alignment: [6, 22, 38] },
  { rawCodewords: 242, dataCodewords: 194, eccCodewordsPerBlock: 24, blocks: 2, alignment: [6, 24, 42] },
  { rawCodewords: 292, dataCodewords: 232, eccCodewordsPerBlock: 30, blocks: 2, alignment: [6, 26, 46] },
  { rawCodewords: 346, dataCodewords: 274, eccCodewordsPerBlock: 18, blocks: 4, alignment: [6, 28, 50] },
];

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

class BitBuffer {
  private readonly bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  append(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  toBytes(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j += 1) {
        value = (value << 1) | (this.bits[i + j] || 0);
      }
      result.push(value);
    }
    return result;
  }
}

function selectVersion(byteLength: number): number {
  for (let version = 1; version <= VERSIONS.length; version += 1) {
    const countBits = version < 10 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLength * 8;
    if (requiredBits <= VERSIONS[version - 1].dataCodewords * 8) return version;
  }
  throw new Error("URL quá dài để render QR trong dashboard");
}

function encodeData(text: string, version: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const info = VERSIONS[version - 1];
  const countBits = version < 10 ? 8 : 16;
  const buffer = new BitBuffer();

  buffer.append(0x4, 4);
  buffer.append(bytes.length, countBits);
  for (const byte of bytes) buffer.append(byte, 8);

  const capacityBits = info.dataCodewords * 8;
  buffer.append(0, Math.min(4, capacityBits - buffer.length));
  while (buffer.length % 8 !== 0) buffer.append(0, 1);

  const data = buffer.toBytes();
  for (let pad = 0xec; data.length < info.dataCodewords; pad ^= 0xec ^ 0x11) {
    data.push(pad);
  }
  return data;
}

function multiply(x: number, y: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    if (((y >>> i) & 1) !== 0) result ^= x;
  }
  return result;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = multiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= multiply(divisor[i], factor);
    }
  }
  return result;
}

function addEccAndInterleave(data: number[], version: number): number[] {
  const info = VERSIONS[version - 1];
  const divisor = reedSolomonDivisor(info.eccCodewordsPerBlock);
  const numShortBlocks = info.blocks - (info.rawCodewords % info.blocks);
  const shortBlockLength = Math.floor(info.rawCodewords / info.blocks);
  const blocks: number[][] = [];
  let offset = 0;

  for (let i = 0; i < info.blocks; i += 1) {
    const dataLength = shortBlockLength - info.eccCodewordsPerBlock + (i < numShortBlocks ? 0 : 1);
    const blockData = data.slice(offset, offset + dataLength);
    offset += dataLength;
    const ecc = reedSolomonRemainder(blockData, divisor);
    if (i < numShortBlocks) blockData.push(0);
    blocks.push(blockData.concat(ecc));
  }

  const result: number[] = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    for (let j = 0; j < blocks.length; j += 1) {
      if (i === shortBlockLength - info.eccCodewordsPerBlock && j < numShortBlocks) continue;
      result.push(blocks[j][i]);
    }
  }
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: throw new Error("QR mask không hợp lệ");
  }
}

function cloneMatrix(matrix: boolean[][]): boolean[][] {
  return matrix.map((row) => [...row]);
}

class QrMatrix {
  readonly size: number;
  private readonly modules: boolean[][];
  private readonly functionModules: boolean[][];

  constructor(private readonly version: number, codewords: number[]) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false));
    this.functionModules = Array.from({ length: this.size }, () => Array<boolean>(this.size).fill(false));
    this.drawFunctionPatterns();
    this.drawCodewords(codewords);
  }

  renderBestMask(): boolean[][] {
    let bestMask = 0;
    let bestPenalty = Infinity;
    let bestModules = cloneMatrix(this.modules);

    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = cloneMatrix(this.modules);
      this.applyMask(candidate, mask);
      this.drawFormatBits(candidate, mask);
      if (this.version >= 7) this.drawVersion(candidate);
      const penalty = this.getPenaltyScore(candidate);
      if (penalty < bestPenalty) {
        bestMask = mask;
        bestPenalty = penalty;
        bestModules = candidate;
      }
    }

    this.applyMask(this.modules, bestMask);
    this.drawFormatBits(this.modules, bestMask);
    if (this.version >= 7) this.drawVersion(this.modules);
    return bestModules;
  }

  private setFunctionModule(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.functionModules[y][x] = true;
  }

  private drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i += 1) {
      this.setFunctionModule(6, i, i % 2 === 0);
      this.setFunctionModule(i, 6, i % 2 === 0);
    }

    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(this.size - 4, 3);
    this.drawFinderPattern(3, this.size - 4);

    const alignment = VERSIONS[this.version - 1].alignment;
    for (const y of alignment) {
      for (const x of alignment) {
        if (this.functionModules[y][x]) continue;
        this.drawAlignmentPattern(x, y);
      }
    }

    this.setFunctionModule(8, this.size - 8, true);
    this.drawFormatBits(this.modules, 0);
    if (this.version >= 7) this.drawVersion(this.modules);
  }

  private drawFinderPattern(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunctionModule(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.setFunctionModule(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  private drawFormatBits(target: boolean[][], mask: number): void {
    const data = (1 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    const set = (x: number, y: number, dark: boolean) => {
      target[y][x] = dark;
      this.functionModules[y][x] = true;
    };

    for (let i = 0; i <= 5; i += 1) set(8, i, getBit(bits, i));
    set(8, 7, getBit(bits, 6));
    set(8, 8, getBit(bits, 7));
    set(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i += 1) set(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i += 1) set(8, this.size - 15 + i, getBit(bits, i));
    set(8, this.size - 8, true);
  }

  private drawVersion(target: boolean[][]): void {
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i += 1) {
      const bit = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      target[b][a] = bit;
      target[a][b] = bit;
      this.functionModules[b][a] = true;
      this.functionModules[a][b] = true;
    }
  }

  private drawCodewords(data: number[]): void {
    let bitIndex = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (this.functionModules[y][x]) continue;

          const byte = data[Math.floor(bitIndex / 8)];
          this.modules[y][x] = bitIndex < data.length * 8 && getBit(byte, 7 - (bitIndex % 8));
          bitIndex += 1;
        }
      }
    }
  }

  private applyMask(target: boolean[][], mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!this.functionModules[y][x] && maskBit(mask, x, y)) {
          target[y][x] = !target[y][x];
        }
      }
    }
  }

  private getPenaltyScore(matrix: boolean[][]): number {
    let result = 0;

    for (let y = 0; y < this.size; y += 1) {
      let runColor = false;
      let runLength = 0;
      for (let x = 0; x < this.size; x += 1) {
        if (x === 0 || matrix[y][x] !== runColor) {
          if (runLength >= 5) result += 3 + runLength - 5;
          runColor = matrix[y][x];
          runLength = 1;
        } else {
          runLength += 1;
        }
      }
      if (runLength >= 5) result += 3 + runLength - 5;
    }

    for (let x = 0; x < this.size; x += 1) {
      let runColor = false;
      let runLength = 0;
      for (let y = 0; y < this.size; y += 1) {
        if (y === 0 || matrix[y][x] !== runColor) {
          if (runLength >= 5) result += 3 + runLength - 5;
          runColor = matrix[y][x];
          runLength = 1;
        } else {
          runLength += 1;
        }
      }
      if (runLength >= 5) result += 3 + runLength - 5;
    }

    for (let y = 0; y < this.size - 1; y += 1) {
      for (let x = 0; x < this.size - 1; x += 1) {
        const color = matrix[y][x];
        if (color === matrix[y][x + 1] && color === matrix[y + 1][x] && color === matrix[y + 1][x + 1]) {
          result += 3;
        }
      }
    }

    result += this.countFinderLikePatterns(matrix);

    let dark = 0;
    for (const row of matrix) for (const module of row) if (module) dark += 1;
    const total = this.size * this.size;
    const balancePenalty = Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return result + balancePenalty;
  }

  private countFinderLikePatterns(matrix: boolean[][]): number {
    const patternA = [true, false, true, true, true, false, true, false, false, false, false];
    const patternB = [false, false, false, false, true, false, true, true, true, false, true];
    let result = 0;

    const matches = (values: boolean[], start: number, pattern: boolean[]) => (
      pattern.every((value, index) => values[start + index] === value)
    );

    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x <= this.size - 11; x += 1) {
        if (matches(matrix[y], x, patternA) || matches(matrix[y], x, patternB)) result += 40;
      }
    }

    for (let x = 0; x < this.size; x += 1) {
      const column = matrix.map((row) => row[x]);
      for (let y = 0; y <= this.size - 11; y += 1) {
        if (matches(column, y, patternA) || matches(column, y, patternB)) result += 40;
      }
    }

    return result;
  }
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[char] || char));
}

export function createQrSvg(text: string, options: QrOptions = {}): string {
  const border = options.border ?? 4;
  const foreground = options.foreground ?? "#020617";
  const background = options.background ?? "#ffffff";
  const bytes = new TextEncoder().encode(text);
  const version = selectVersion(bytes.length);
  const data = encodeData(text, version);
  const codewords = addEccAndInterleave(data, version);
  const matrix = new QrMatrix(version, codewords).renderBestMask();
  const size = matrix.length;
  const total = size + border * 2;
  const path = matrix.flatMap((row, y) => (
    row.map((dark, x) => (dark ? `M${x + border} ${y + border}h1v1H${x + border}z` : ""))
  )).filter(Boolean).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${escapeXml(text)}">`,
    `<rect width="${total}" height="${total}" fill="${escapeXml(background)}"/>`,
    `<path d="${path}" fill="${escapeXml(foreground)}"/>`,
    "</svg>",
  ].join("");
}

export async function downloadQrPng(svg: string, fileName: string, size = 1200): Promise<void> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Không thể render ảnh QR"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Trình duyệt không hỗ trợ canvas");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);

    await new Promise<void>((resolve, reject) => {
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error("Không thể tạo file PNG"));
          return;
        }
        const downloadUrl = URL.createObjectURL(pngBlob);
        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(downloadUrl);
        resolve();
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
