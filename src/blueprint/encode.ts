// Factorio blueprint strings: a version byte ("0"), then base64 of zlib-deflated JSON.
// Ported from encodeBlueprint in artifacts/FCP_v1-2.html, plus a decoder so exports can be tested.

const VERSION_BYTE = "0";

/** Factorio 2.0.0 blueprint version number, as written by the artifacts. */
export const BLUEPRINT_VERSION_2_0 = 562949953421312;

export async function encodeBlueprint(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return VERSION_BYTE + btoa(bin);
}

export async function decodeBlueprint(str: string): Promise<unknown> {
  if (!str.startsWith(VERSION_BYTE)) {
    throw new Error(`Unsupported blueprint string version byte: ${JSON.stringify(str[0])}`);
  }
  const bin = atob(str.slice(1));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return JSON.parse(await new Response(stream).text());
}
