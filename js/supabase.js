import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.2/+esm";
const supabaseUrl = "https://luewrpzgetqslxqmdcxv.supabase.co";
const supabaseKey = "sb_publishable_zJc68aiTxJs7HBgaqeHxrQ_JDcm91xG";
export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
