const http = require('http');
const res = require('express/lib/response');

const PORT = process.env.PORT || 3000;

// Armazena os pulsos pendentes por box
const filaPulsos = {};
const historico = [];

const servidor = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Página principal
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Jukebox Pix funcionando! Servidor ativo ✅');
  }

  // Rota para enviar pulso de teste / pagamento
  if (req.url.startsWith('/api/teste-pulso') && req.method === 'GET') {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const box = urlParams.get('box');
    const qtd = parseInt(urlParams.get('qtd')) || 0;
    
    if (!box || qtd <= 0) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ erro: 'Parâmetros inválidos' }));
    }
    
    // Armazena o pulso
    filaPulsos[box] = (filaPulsos[box] || 0) + qtd;
    
    // Registra no histórico
    historico.unshift({
      box,
      valor: qtd === 2 ? 2.00 : qtd === 5 ? 5.00 : qtd === 10 ? 10.00 : qtd === 20 ? 20.00 : 50.00,
      pulsos: qtd,
      data: new Date().toLocaleString('pt-BR')
    });
    
    console.log(`✅ Pulso enviado: ${box} → ${qtd} pulsos`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ sucesso: true, box, pulsos: qtd }));
  }

  // Rota para a ESP32 buscar e CONSUMIR os pulsos (uma vez só!)
  if (req.url.startsWith('/webhook-esp32') && req.method === 'GET') {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const box = urlParams.get('box');
    const qtd = filaPulsos[box] || 0;
    
    // Zera depois de ler — a ESP32 só recebe uma vez!
    delete filaPulsos[box];
    
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end(String(qtd));
  }

  // Rota para o painel consultar sem consumir
  if (req.url.startsWith('/api/status') && req.method === 'GET') {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const box = urlParams.get('box');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ 
      box, 
      pendente: filaPulsos[box] || 0,
      historico: historico.slice(0, 20)
    }));
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Não encontrado');
});

servidor.listen(PORT, () => {
  console.log(`🚀 Servidor Jukebox Pix rodando na porta ${PORT}`);
});
