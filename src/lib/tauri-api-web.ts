export async function invoke<T = any>(cmd: string, args: Record<string, any> = {}): Promise<T> {
  switch (cmd) {
    case "get_current_db_path": {
      return "postgres://render-web" as unknown as T;
    }
    case "get_custom_db_path_setting": {
      return "postgres://render-web" as unknown as T;
    }
    case "select_shared_db_location": {
      return "" as unknown as T;
    }
    case "clear_shared_db_location": {
      return true as unknown as T;
    }
    case "save_custom_db_connection": {
      return true as unknown as T;
    }
    case "activate_license_key": {
      return true as unknown as T;
    }
    case "get_machine_fingerprint": {
      return "render-web-instance" as unknown as T;
    }
    case "test_postgres_connection": {
      const res = await fetch("/api/db/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to test connection");
      return data as unknown as T;
    }
    case "test_mssql_connection": {
      return true as unknown as T;
    }
    case "export_db_backup": {
      return "backup_neugate.sql" as unknown as T;
    }
    case "import_db_backup": {
      return "" as unknown as T;
    }
    case "get_storage_config": {
      return { storage_type: "cloud", sync_folder: "" } as unknown as T;
    }
    case "select_sync_folder": {
      return "" as unknown as T;
    }
    case "save_storage_config": {
      return true as unknown as T;
    }
    case "get_unisms_account_info": {
      return "{}" as unknown as T;
    }
    case "send_unisms_sms": {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send SMS");
      return data as unknown as T;
    }
    default:
      console.info(`[Web invoke] Command handled in web mode: ${cmd}`, args);
      return "" as unknown as T;
  }
}
