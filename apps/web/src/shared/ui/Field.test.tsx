import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from './Field';

describe('Field', () => {
  it('ties hint and error to the invalid input', () => {
    const html = renderToStaticMarkup(
      <Field id="email" label="Email" hint="Пример: name@example.com" error="Укажите email">
        <input type="email" />
      </Field>,
    );
    expect(html).toContain('aria-describedby="email-hint email-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="email-hint"');
    expect(html).toContain('id="email-error"');
    expect(html).toContain('for="email"');
  });
});
