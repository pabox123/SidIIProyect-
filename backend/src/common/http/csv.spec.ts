import { toCsv, formatNumber, formatMinutes, buildFilename } from './csv';

describe('CSV utilities (M-08)', () => {
  describe('toCsv', () => {
    it('debe generar CSV con BOM UTF-8 al inicio', () => {
      const csv = toCsv([{ key: 'a', header: 'A' }], [{ a: 1 }]);
      expect(csv.charCodeAt(0)).toBe(0xFEFF); // BOM
    });

    it('debe usar punto y coma como separador', () => {
      const csv = toCsv(
        [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }],
        [{ a: 1, b: 2 }]
      );
      // Saltar BOM y verificar separador
      const lines = csv.split('\r\n');
      expect(lines[0]).toContain('A;B');
      expect(lines[1]).toContain('1;2');
    });

    it('debe usar CRLF como fin de línea', () => {
      const csv = toCsv([{ key: 'a', header: 'A' }], [{ a: 1 }, { a: 2 }]);
      expect(csv).toMatch(/\r\n$/);
      const lines = csv.split('\r\n');
      // split por \r\n en string que termina en \r\n produce: [header, row1, row2, '']
      expect(lines.length).toBe(4);
      expect(lines[0]).toContain('A');
      expect(lines[1]).toContain('1');
      expect(lines[2]).toContain('2');
      expect(lines[3]).toBe('');
    });

    it('debe incluir encabezados correctos', () => {
      const csv = toCsv(
        [{ key: 'plan', header: 'Plan' }, { key: 'total', header: 'Total (COP)' }],
        [{ plan: 'Básico', total: 10000 }]
      );
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('﻿Plan;Total (COP)');
    });

    it('debe traducir tipo de contenido a español (Película, Serie, Documental)', () => {
      const csv = toCsv(
        [{ key: 'tipo', header: 'Tipo de contenido' }],
        [{ tipo: 'Película' }, { tipo: 'Serie' }, { tipo: 'Documental' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('Película');
      expect(lines[2]).toContain('Serie');
      expect(lines[3]).toContain('Documental');
    });

    it('debe formatear montos con coma decimal y dos decimales', () => {
      const csv = toCsv(
        [{ key: 'monto', header: 'Total (COP)' }],
        [{ monto: '20000,00' }, { monto: '15000,50' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('20000,00');
      expect(lines[2]).toContain('15000,50');
    });

    it('debe escapar comillas dobles duplicándolas', () => {
      const csv = toCsv(
        [{ key: 'texto', header: 'Texto' }],
        [{ texto: 'Plan "Premium"' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('"Plan ""Premium"""');
    });

    it('debe envolver en comillas campos con punto y coma', () => {
      const csv = toCsv(
        [{ key: 'texto', header: 'Texto' }],
        [{ texto: 'Plan; con punto y coma' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('"Plan; con punto y coma"');
    });

    it('debe envolver en comillas campos con saltos de línea', () => {
      const csv = toCsv(
        [{ key: 'texto', header: 'Texto' }],
        [{ texto: 'Línea 1\nLínea 2' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('"Línea 1\nLínea 2"');
    });

    it('debe proteger contra inyección de fórmulas con = al inicio', () => {
      const csv = toCsv(
        [{ key: 'formula', header: 'Fórmula' }],
        [{ formula: '=SUMA(A1:A10)' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain("'=SUMA(A1:A10)");
    });

    it('debe proteger contra inyección de fórmulas con + al inicio', () => {
      const csv = toCsv(
        [{ key: 'formula', header: 'Fórmula' }],
        [{ formula: '+CMD|/C CALC' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain("'+CMD|/C CALC");
    });

    it('debe proteger contra inyección de fórmulas con - al inicio', () => {
      const csv = toCsv(
        [{ key: 'formula', header: 'Fórmula' }],
        [{ formula: '-1+1' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain("'-1+1");
    });

    it('debe proteger contra inyección de fórmulas con @ al inicio', () => {
      const csv = toCsv(
        [{ key: 'formula', header: 'Fórmula' }],
        [{ formula: '@SUM(A1:A10)' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain("'@SUM(A1:A10)");
    });

    it('debe generar solo encabezados cuando no hay filas', () => {
      const csv = toCsv(
        [{ key: 'plan', header: 'Plan' }, { key: 'total', header: 'Total (COP)' }],
        []
      );
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe('﻿Plan;Total (COP)');
      expect(lines[1]).toBe(''); // línea final vacía
    });

    it('debe manejar valores null y undefined como vacíos', () => {
      const csv = toCsv(
        [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }],
        [{ a: 'valor', b: null }, { a: undefined, b: 'otro' }]
      );
      const lines = csv.split('\r\n');
      expect(lines[1]).toContain('valor;');
      expect(lines[2]).toContain(';otro');
    });
  });

  describe('formatNumber', () => {
    it('debe formatear entero con dos decimales y coma', () => {
      expect(formatNumber(20000)).toBe('20000,00');
    });

    it('debe formatear decimal con dos decimales y coma', () => {
      expect(formatNumber(15000.5)).toBe('15000,50');
    });

    it('debe redondear a dos decimales', () => {
      expect(formatNumber(10000.123)).toBe('10000,12');
      expect(formatNumber(10000.126)).toBe('10000,13');
    });

    it('debe manejar cero', () => {
      expect(formatNumber(0)).toBe('0,00');
    });

    it('debe manejar números negativos', () => {
      expect(formatNumber(-5000)).toBe('-5000,00');
    });
  });

  describe('formatMinutes', () => {
    it('debe formatear minutos con coma decimal y dos decimales', () => {
      expect(formatMinutes(176.67)).toBe('176,67');
    });

    it('debe formatear minutos enteros con dos decimales', () => {
      expect(formatMinutes(120)).toBe('120,00');
    });
  });

  describe('buildFilename', () => {
    it('debe generar nombre en minúsculas sin tildes ni espacios con rango', () => {
      const filename = buildFilename('informe ingresos por plan', '2026-11-01', '2026-11-30');
      expect(filename).toBe('informe_ingresos_por_plan_2026-11-01_a_2026-11-30.csv');
    });

    it('debe quitar tildes', () => {
      const filename = buildFilename('informe_ingresos_por_plan', '2026-11-01', '2026-11-30');
      expect(filename).not.toMatch(/[áéíóú]/);
    });

    it('debe usar "todo_el_periodo" cuando no hay rango', () => {
      const filename = buildFilename('informe_ingresos_por_plan');
      expect(filename).toBe('informe_ingresos_por_plan_todo_el_periodo.csv');
    });

    it('debe reemplazar caracteres especiales', () => {
      const filename = buildFilename('informe@ingresos!por#plan', '2026-11-01', '2026-11-30');
      expect(filename).toBe('informeingresosporplan_2026-11-01_a_2026-11-30.csv');
    });
  });
});