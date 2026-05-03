import { mapToParsedPunches, parseJsonResponse } from './pdf-vision-parser.service';

const noopLogger = { warn: () => {} };

describe('parseJsonResponse', () => {
  it('parses raw JSON', () => {
    const out = parseJsonResponse('{"records":[]}');
    expect(out.records).toEqual([]);
  });

  it('strips markdown code fences', () => {
    const out = parseJsonResponse('```json\n{"records":[{"full_name":"محمد"}]}\n```');
    expect(out.records?.[0].full_name).toBe('محمد');
  });

  it('strips bare ``` fences', () => {
    const out = parseJsonResponse('```\n{"report_date":"2026-05-01"}\n```');
    expect(out.report_date).toBe('2026-05-01');
  });

  it('extracts JSON when prefixed with explanatory prose', () => {
    const text = 'Here is the JSON:\n{"records":[{"full_name":"x"}]}\nDone.';
    const out = parseJsonResponse(text);
    expect(out.records?.[0].full_name).toBe('x');
  });

  it('throws on completely invalid JSON', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow();
  });
});

describe('mapToParsedPunches', () => {
  it('maps a clean response to ParsedPunch[]', () => {
    const result = mapToParsedPunches(
      {
        report_date: '2026-05-01',
        records: [
          {
            employee_number: '11',
            full_name: 'إيهاب إبراهيم بخاري',
            department: 'التوزيع',
            date: '2026-05-01',
            time: '01:37',
            punch_type: 'check_in',
            work_code: '0',
            data_source: 'الجهاز',
          },
        ],
      },
      noopLogger,
    );

    expect(result.warnings).toEqual([]);
    expect(result.punches).toHaveLength(1);
    expect(result.reportDate?.toISOString()).toContain('2026-05-01');

    const p = result.punches[0];
    expect(p.rawEmployeeNumber).toBe('11');
    expect(p.rawName).toBe('إيهاب إبراهيم بخاري');
    expect(p.rawDepartment).toBe('التوزيع');
    expect(p.recordTime).toBe('01:37');
    expect(p.punchType).toBe('check_in');
    expect(p.workCode).toBe('0');
    expect(p.dataSource).toBe('الجهاز');
  });

  it('zero-pads single-digit hours', () => {
    const result = mapToParsedPunches(
      {
        records: [
          {
            employee_number: '1',
            full_name: 'x',
            date: '2026-05-01',
            time: '1:05',
            punch_type: 'check_in',
          },
        ],
      },
      noopLogger,
    );
    expect(result.punches[0].recordTime).toBe('01:05');
  });

  it('skips records with missing required fields and records warnings', () => {
    const result = mapToParsedPunches(
      {
        records: [
          // valid
          {
            employee_number: '1',
            full_name: 'محمد',
            date: '2026-05-01',
            time: '08:00',
            punch_type: 'check_in',
          },
          // missing time
          {
            employee_number: '2',
            full_name: 'علي',
            date: '2026-05-01',
            punch_type: 'check_in',
          },
          // missing punch_type
          {
            employee_number: '3',
            full_name: 'سعد',
            date: '2026-05-01',
            time: '09:00',
          },
        ],
      },
      noopLogger,
    );

    expect(result.punches).toHaveLength(1);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain('time');
    expect(result.warnings[1]).toContain('punch_type');
  });

  it('rejects out-of-range times', () => {
    const result = mapToParsedPunches(
      {
        records: [
          {
            employee_number: '1',
            full_name: 'x',
            date: '2026-05-01',
            time: '25:00', // invalid hour
            punch_type: 'check_in',
          },
        ],
      },
      noopLogger,
    );
    expect(result.punches).toHaveLength(0);
    expect(result.warnings[0]).toContain('وقت غير صالح');
  });

  it('rejects malformed dates', () => {
    const result = mapToParsedPunches(
      {
        records: [
          {
            employee_number: '1',
            full_name: 'x',
            date: '2026/05/01',
            time: '08:00',
            punch_type: 'check_in',
          },
        ],
      },
      noopLogger,
    );
    expect(result.punches).toHaveLength(0);
    expect(result.warnings[0]).toContain('تاريخ غير صالح');
  });

  it('handles empty records gracefully', () => {
    const result = mapToParsedPunches({ records: [] }, noopLogger);
    expect(result.punches).toEqual([]);
    expect(result.reportDate).toBeNull();
  });

  it('infers report_date from first record when header is missing', () => {
    const result = mapToParsedPunches(
      {
        records: [
          {
            employee_number: '1',
            full_name: 'x',
            date: '2026-05-03',
            time: '08:00',
            punch_type: 'check_in',
          },
        ],
      },
      noopLogger,
    );
    expect(result.reportDate?.toISOString()).toContain('2026-05-03');
  });

  it('handles null department/work_code/data_source', () => {
    const result = mapToParsedPunches(
      {
        records: [
          {
            employee_number: '1',
            full_name: 'x',
            department: null,
            date: '2026-05-01',
            time: '08:00',
            punch_type: 'check_in',
            work_code: null,
            data_source: null,
          },
        ],
      },
      noopLogger,
    );
    expect(result.punches[0].rawDepartment).toBe('');
    expect(result.punches[0].workCode).toBeNull();
    expect(result.punches[0].dataSource).toBeNull();
  });
});
