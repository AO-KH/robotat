// Safety guard: the integration tests TRUNCATE tables, so refuse to run against
// anything but a database whose name clearly marks it as a test database.
const url = process.env.DATABASE_URL ?? "";
if (!/test/i.test(url)) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL must point to a test database (name containing "test"). Got: ${url || "(unset)"}`,
  );
}
