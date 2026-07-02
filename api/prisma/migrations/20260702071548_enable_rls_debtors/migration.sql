ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;

CREATE POLICY debtors_tenant_isolation ON debtors
  USING (client_id::text = current_setting('app.current_client_id', true));
