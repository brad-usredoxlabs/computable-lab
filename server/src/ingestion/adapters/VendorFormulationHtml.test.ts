import { describe, expect, it } from 'vitest';
import { extractVendorFormulationHtml } from './vendorFormulationHtml.js';

const SIGMA_HTML = `
<!doctype html>
<html>
  <head>
    <title>Sigma RPMI 1640 Media Formulations</title>
  </head>
  <body>
    <h1>RPMI 1640 Media Formulations</h1>
    <h2>RPMI 1640 with L-glutamine</h2>
    <table>
      <tr><th>Component</th><th>Concentration</th></tr>
      <tr><td>Glucose</td><td>2 g/L</td></tr>
      <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
      <tr><td>L-Glutamine</td><td>0.3 g/L</td></tr>
    </table>
    <h2>RPMI 1640 without L-glutamine</h2>
    <table>
      <tr><th>Component</th><th>Concentration</th></tr>
      <tr><td>Glucose</td><td>2 g/L</td></tr>
      <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
      <tr><td>Calcium nitrate tetrahydrate</td><td>0.1 g/L</td></tr>
    </table>
    <h2>RPMI 1640 with HEPES</h2>
    <table>
      <tr><th>Component</th><th>Concentration</th></tr>
      <tr><td>Glucose</td><td>2 g/L</td></tr>
      <tr><td>Sodium bicarbonate</td><td>2 g/L</td></tr>
      <tr><td>HEPES</td><td>5 g/L</td></tr>
    </table>
  </body>
</html>
`;

describe('vendor formulation HTML adapter', () => {
  it('extracts Sigma-style variants and ingredient rows from HTML', async () => {
    const result = await extractVendorFormulationHtml({
      contentBase64: Buffer.from(SIGMA_HTML, 'utf8').toString('base64'),
    });

    expect(result.title).toContain('RPMI 1640');
    expect(result.vendor).toBe('Sigma-Aldrich');
    expect(result.variants).toHaveLength(3);
    expect(result.variants[0]?.ingredients[0]?.componentName).toBe('Glucose');
    expect(result.variants[0]?.ingredients[0]?.concentration).toMatchObject({
      value: 2,
      unit: 'g/L',
      basis: 'mass_per_volume',
    });
    expect(result.variants[1]?.ingredients.some((item) => item.componentName === 'Calcium nitrate tetrahydrate')).toBe(true);
  });
});
