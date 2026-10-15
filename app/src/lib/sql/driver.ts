export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;
export interface SqlConnection {
  query(sql: string, params?: SqlValue[]): Promise<Row[]>;
  close(): Promise<void>;
}
export interface SqlDriver { open(location: string): Promise<SqlConnection> }
