const http = require('http');
const PORTA = process.env.PORT || 3000;

const boxStatus = {};
const filaPulsos = {};
const historicoPagamentos = [];

const servidor = http.createServer((req, res) => {
  res.setHeader('Access‑Control‑Allow‑Origin', '*');
  res.setHeader('Access‑Control‑Allow‑Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access‑Control‑Allow‑Headers', 'Content‑Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content‑Type':'text/plain; charset=utf‑8'});
    res.end('✅ Jukebox Pix está funcionando! ' + new Date().toLocaleString('pt‑BR'));
  }
  else if (req.url.startsWith('/online') && req.method === 'POST') {
    let corpo = '';
    req.on('data', d => corpo += d);
    req.on('end', () => {
      const params = new URLSearchParams(corpo);
      const nomeBox = params.get('box');
      const ip = params.get('ip');
      boxStatus[nomeBox] = { online:true, ultimoPing:Date.now(), ip };
      if (!filaPulsos[nomeBox]) filaPulsos[nomeBox] = 0;
      console.log(`✅ ${nomeBox} ONLINE (${ip})`);
      res.writeHead(200, {'Content‑Type':'application/json'});
      res.end(JSON.stringify({ok:true, mensagem:`${nomeBox} registrado`}));
    });
  }
  else if (req.url.startsWith('/webhook‑esp32') && req.method === 'GET') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const nomeBox = url.searchParams.get('box');
    let qtd = 0;
    if (filaPulsos[nomeBox]) {
      qtd = filaPulsos[nomeBox];
      filaPulsos[nomeBox] = 0;
    }
    if (boxStatus[nomeBox]) boxStatus[nomeBox].ultimoPing = Date.now();
    res.writeHead(200, {'Content‑Type':'text/plain'});
    res.end(String(qtd));
  }
  else if (req.url === '/webhook‑pagbank' && req.method === 'POST') {
    let corpo = '';
    req.on('data', d => corpo += d);
    req.on('end', () => {
      let dados;
      try { dados = JSON.parse(corpo); }
      catch { dados = Object.fromEntries(new URLSearchParams(corpo)); }
      const valor = Number(dados.valor || dados.amount || 0);
      const nomeBox = dados.box || dados.referencia || 'Box‑01';
      let pulsos = 0;
      if (valor === 2.00) pulsos = 2;
      else if (valor === 5.00) pulsos = 5;
      else if (valor === 10.00) pulsos = 10;
      else if (valor === 20.00) pulsos = 20;
      else if (valor === 50.00) pulsos = 50;
      if (pulsos > 0) {
        filaPulsos[nomeBox] = (filaPulsos[nomeBox] || 0) + pulsos;
        historicoPagamentos.unshift({data:new Date().toLocaleString('pt‑BR'), box:nomeBox, valor:valor, pulsos:pulsos});
        console.log(`💵 ${nomeBox} R$ ${valor.toFixed(2)} → ${pulsos} pulsos`);
      } else {
        console.log(`⚠️ Valor R$ ${valor} não aceito`);
      }
      res.writeHead(200, {'Content‑Type':'application/json'});
      res.end(JSON.stringify({ok:true, pulsosEnviados:pulsos}));
    });
  }
  else if (req.url === '/api/boxes' && req.method === 'GET') {
    const lista = Object.entries(boxStatus).map(([nome, dados]) => ({
      nome, online: dados.online && (Date.now()‑dados.ultimoPing) < 10000, ip:dados.ip
    }));
    res.writeHead(200, {'Content‑Type':'application/json'});
    res.end(JSON.stringify(lista));
  }
  else if (req.url === '/api/historico' && req.method === 'GET') {
    res.writeHead(200, {'Content‑Type':'application/json'});
    res.end(JSON.stringify(historicoPagamentos.slice(0,100)));
  }
  else if (req.url.startsWith('/api/teste‑pulso') && req.method === 'POST') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const nomeBox = url.searchParams.get('box');
    const qtd = Number(url.searchParams.get('qtd') || 0);
    filaPulsos[nomeBox] = (filaPulsos[nomeBox] || 0) + qtd;
    console.log(`🔧 Teste: ${qtd} pulsos para ${nomeBox}`);
    res.writeHead(200, {'Content‑Type':'application/json'});
    res.end(JSON.stringify({ok:true, mensagem:`${qtd} pulsos enviados`}));
  }
  else if (req.url === '/api/zerar' && req.method === 'POST') {
    historicoPagamentos.length = 0;
    res.writeHead(200, {'Content‑Type':'application/json'});
    res.end(JSON.stringify({ok:true, mensagem:'Histórico zerado'}));
  }
  else {
    res.writeHead(404);
    res.end('Rota não encontrada');
  }
});

servidor.listen(PORTA, () => {
  console.log('🚀 Servidor Jukebox Pix rodando!');
});
