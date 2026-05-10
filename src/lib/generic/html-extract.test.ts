import { describe, it, expect } from "vitest";
import { extractTextBySelector } from "./html-extract.js";

describe("extractTextBySelector", () => {
  const html = `
    <table>
      <tbody>
        <tr><td><a href="/wiki/FC_Halifax_Town">FC Halifax Town</a></td></tr>
        <tr><td><a href="/wiki/Wrexham_AFC">Wrexham AFC</a></td></tr>
        <tr><td><a href="/wiki/Altrincham_FC">Altrincham FC</a></td></tr>
      </tbody>
    </table>
  `;

  it("returns text from all elements matching the selector", () => {
    const result = extractTextBySelector(html, "tbody tr td a");

    expect(result).toEqual(["FC Halifax Town", "Wrexham AFC", "Altrincham FC"]);
  });

  it("returns a single match when selector targets one element", () => {
    const result = extractTextBySelector(html, "tbody tr:first-child td a");

    expect(result).toEqual(["FC Halifax Town"]);
  });

  it("returns an empty array when no elements match", () => {
    const result = extractTextBySelector(html, "tbody tr td span");

    expect(result).toEqual([]);
  });

  it("trims whitespace from extracted text", () => {
    const spacedHtml = "<div>  padded text  </div>";

    const result = extractTextBySelector(spacedHtml, "div");

    expect(result).toEqual(["padded text"]);
  });

  it("excludes elements with no text content", () => {
    const mixedHtml = `
      <ul>
        <li><a>Solihull Moors</a></li>
        <li><a></a></li>
        <li><a>Eastleigh FC</a></li>
      </ul>
    `;

    const result = extractTextBySelector(mixedHtml, "li a");

    expect(result).toEqual(["Solihull Moors", "Eastleigh FC"]);
  });

  it("handles nth-child selectors", () => {
    const result = extractTextBySelector(html, "tbody tr:nth-child(n+2) td a");

    expect(result).toEqual(["Wrexham AFC", "Altrincham FC"]);
  });
});
