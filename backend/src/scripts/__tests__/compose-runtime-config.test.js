'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { validateRuntimeConfig } = require('../../middleware/security');

const compose = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../../../../docker-compose.yml'), 'utf8'));
const runtimeNames = [...new Set([...validateRuntimeConfig.toString().matchAll(/env\.([A-Z][A-Z0-9_]*)/g)]
  .map((match) => match[1]))];

describe.each(['migrate', 'backend'])('Compose %s runtime environment', (service) => {
  test.each(['staging', 'production'])('passes every required %s runtime variable with required interpolation', (appEnv) => {
    const valid = Object.fromEntries(runtimeNames.map((name) => [name, 'x'.repeat(64)]));
    Object.assign(valid, { NODE_ENV: 'production', APP_ENV: appEnv });
    expect(() => validateRuntimeConfig(valid)).not.toThrow();

    const required = runtimeNames.filter((name) => {
      const omitted = { ...valid };
      delete omitted[name];
      try { validateRuntimeConfig(omitted); return false; } catch (_) { return true; }
    });
    expect(required).toEqual(expect.arrayContaining(['JWT_SECRET', 'DB_PASSWORD', 'WEBHOOK_ENCRYPTION_KEY']));
    for (const name of required) {
      const environment = compose.services[service].environment;
      expect(environment).toHaveProperty(name);
      expect(environment[name]).toMatch(new RegExp(`^\\$\\{${name}:\\?[^}]+\\}$`));
    }
  });

  test('passes the previous webhook encryption key as optional', () => {
    expect(compose.services[service].environment.WEBHOOK_ENCRYPTION_KEY_PREVIOUS)
      .toBe('${WEBHOOK_ENCRYPTION_KEY_PREVIOUS:-}');
  });
});
