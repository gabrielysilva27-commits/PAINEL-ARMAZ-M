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

  poll(info) {
    return this.call("agent_poll", info);
  }

  complete(payload) {
    return this.call("agent_complete", payload);
  }

  fail(payload) {
    return this.call("agent_fail", payload);
  }
}

module.exports = { AgentApi: AgentApi };
