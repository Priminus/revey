import { renderPreview } from './config-format';

describe('renderPreview', () => {
  it('substitutes known vars and blanks unknown ones', () => {
    expect(renderPreview('Hi {{debtor_name}}, {{nope}}', { debtor_name: 'Acme' })).toBe(
      'Hi Acme, ',
    );
  });

  it('blanks a prototype key like {{constructor}} rather than resolving it via the prototype chain', () => {
    expect(renderPreview('{{constructor}}', { debtor_name: 'Acme' })).toBe('');
  });
});
