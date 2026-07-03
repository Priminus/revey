import { renderTemplate, buildVars } from './template.service';

describe('renderTemplate', () => {
  it('substitutes known vars and blanks unknown', () => {
    expect(renderTemplate('Hi {{debtor_name}}, you owe {{outstanding_amount}}. {{nope}}', {
      debtor_name: 'Acme', outstanding_amount: '$500',
    })).toBe('Hi Acme, you owe $500. ');
  });
});

describe('buildVars', () => {
  it('builds the supported variables incl. invoice_list', () => {
    const vars = buildVars('Acme', 86150_00, 3, 120, [
      { invoiceNumber: 'INV-31', amountDueCents: 45000_00, overdueDays: 120 },
    ]);
    expect(vars.debtor_name).toBe('Acme');
    expect(vars.outstanding_amount).toBe('$86,150');
    expect(vars.invoice_count).toBe('3');
    expect(vars.oldest_days_overdue).toBe('120');
    expect(vars.invoice_list).toContain('INV-31');
    expect(vars.invoice_list).toContain('120 days overdue');
  });
});
