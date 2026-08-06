import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const supabaseUrl = "https://luewrpzgetqslxqmdcxv.supabase.co";
const supabaseKey = "sb_publishable_zJc68aiTxJs7HBgaqeHxrQ_JDcm91xG";
export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
