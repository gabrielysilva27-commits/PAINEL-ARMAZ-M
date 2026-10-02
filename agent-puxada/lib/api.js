class AgentApi {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async call(action, payload) {
    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-token": this.token
      },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    const data = await response.json().catch(function () {
      return { error: "Resposta invalida da API." };
    });
    if (!response.ok) {
      throw new Error(data.error || "Falha na comunicacao com o Painel Armazem.");
    }
    return data;
  }

  ping(info) {
    return this.call("agent_ping", info);
  }

  poll(info) {
    return this.call("agent_poll", info);
  }

  heartbeat(payload) {
    return this.call("agent_heartbeat", payload);
  }

  complete(payload) {
    return this.call("agent_complete", payload);
  }

  fail(payload) {
    return this.call("agent_fail", payload);
  }

  updateManifest(info) {
    return this.call("agent_update_manifest", info);
  }

  updateState(payload) {
    return this.call("agent_update_state", payload);
  }

  updateFile(payload) {
    return this.call("agent_update_file", payload);
  }

  oorStatus() {
    return this.call("agent_oor_status", {});
  }

  oorScanState(payload) {
    return this.call("agent_oor_scan_state", payload);
  }

  oorDiagnostic(payload) {
    return this.call("agent_oor_diagnostic", payload);
  }

  oorImport(payload) {
    return this.call("agent_oor_import", payload);
  }

  pull031120Status() {
    return this.call("agent_031120_status", {});
  }

  pull031120Import(payload) {
    return this.call("agent_031120_import", payload);
  }

  report031120Import(payload) {
    return this.call("agent_report_031120_import", payload);
  }

  pull031120State(payload) {
    return this.call("agent_031120_state", payload);
  }
}

module.exports = { AgentApi: AgentApi };
