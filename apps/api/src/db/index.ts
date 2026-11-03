import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;
/** Either the pool or a transaction: queries that may run inside a caller's transaction take this. */
export type Db = Sql | Tx;

// Instants cross the app as ISO-8601 UTC strings (the API contract), never as Date objects.
const TIMESTAMPTZ = 1184;

export function connect(url: string, max = 10): Sql {
  return postgres(url, {
    max,
    onnotice: () => {},
    transform: postgres.camel,
    types: {
      instant: {
        to: TIMESTAMPTZ,
        from: [TIMESTAMPTZ],
        serialize: (value: string | Date) => (value instanceof Date ? value.toISOString() : value),
        parse: (value: string) => new Date(value).toISOString(),
      },
    },
  });
}
