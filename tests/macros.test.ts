import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const macrosDir = path.resolve(__dirname, '../macros');

describe('Macro First Line Format', () => {
  const files = fs.readdirSync(macrosDir).filter((file) => file.endsWith('.js'));

  it('should find at least one macro', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  files.forEach((file) => {
    it(`should validate the header comment format for ${file}`, () => {
      const filePath = path.join(macrosDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      expect(lines.length).toBeGreaterThan(0);

      const firstLine = lines[0].trim();
      const match = firstLine.match(/^\/\*\s*(\{.*?\})\s*\*\/$/);

      expect(
        match,
        `First line of ${file} must be a block comment /* ... */`
      ).not.toBeNull();

      let header: Record<string, unknown>;
      try {
        header = JSON.parse(match![1]) as Record<string, unknown>;
      } catch (err) {
        throw new Error(
          `First line comment of ${file} does not contain valid JSON: ${match![1]}`
        );
      }

      expect(
        header.name,
        `Macro "${file}" is missing the mandatory "name" property.`
      ).toBeTypeOf('string');
      expect(
        (header.name as string).length,
        `Macro "${file}" has an empty "name" property.`
      ).toBeGreaterThan(0);

      expect(
        header.img,
        `Macro "${file}" is missing the mandatory "img" property.`
      ).toBeTypeOf('string');
      expect(
        (header.img as string).length,
        `Macro "${file}" has an empty "img" property.`
      ).toBeGreaterThan(0);

      expect(
        header._id,
        `Macro "${file}" is missing the mandatory "_id" property.`
      ).toBeTypeOf('string');
      expect(
        header._id as string,
        `Macro "${file}" "_id" must be exactly 16 characters.`
      ).toHaveLength(16);
    });
  });
});
