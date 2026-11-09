const http = require('http');
const PORTA = process.env.PORT || 3000;

const boxStatus = {};
const filaPulsos = {};
const historicoPagamentos = [];

const servidor = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('Jukebox Pix esta funcionando! ' + new Date().toLocaleString('pt-BR'));
  }
  else if (req.url.startsWith('/online') && req.method === 'POST') {
    let corpo = '';
    req.on('data', d => corpo += d);
    req.on('end', () => {
      const params = new URLSearchParams(corpo);
      const nomeBox = params.get('box');
      const ip = params.get('ip');
      boxStatus[nomeBox] = { online: true, ultimoPing: Date.now(), ip: ip };
      if (!filaPulsos[nomeBox]) filaPulsos[nomeBox] = 0;
      console.log(nomeBox + ' ONLINE - ' + ip);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true}));
    });
  }
  else if (req.url.startsWith('/webhook-esp32') && req.method === 'GET') {
    const url = new URL(req.url, 'http://' + req.headers.host);
    const nomeBox = url.searchParams.get('box');
    let qtd = 0;
    if (filaPulsos[nomeBox]) {
      qtd = filaPulsos[nomeBox];
      filaPulsos[nomeBox] = 0;
    }
    if (boxStatus[nomeBox]) {
      boxStatus[nomeBox].ultimoPing = Date.now();
      boxStatus[nomeBox].online = true;
    }
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(String(qtd));
  }
  else if (req.url === '/webhook-pagbank' && req.method === 'POST') {
    let corpo = '';
    req.on('data', d => corpo += d);
    req.on('end', () => {
      let dados;
      try {
        dados = JSON.parse(corpo);
      } catch(e) {
        dados = {};
      }
      const valor = Number(dados.valor || dados.amount || 0);
      const nomeBox = dados.box || dados.referencia || 'Box-01';
      let pulsos = 0;
      if (valor === 2) pulsos = 2;
      else if (valor === 5) pulsos = 5;
      else if (valor === 10) pulsos = 10;
      else if (valor === 20) pulsos = 20;
      else if (valor === 50) pulsos = 50;
      
      if (pulsos > 0) {
        filaPulsos[nomeBox] = (filaPulsos[nomeBox] || 0) + pulsos;
        historicoPagamentos.unshift({
          data: new Date().toLocaleString('pt-BR'),
          box: nomeBox,
          valor: valor,
          pulsos: pulsos
        });
        console.log('Pagamento: ' + nomeBox + ' R$ ' + valor + ' = ' + pulsos + ' pulsos');
      } else {
        console.log('Valor nao aceito: R$ ' + valor);
      }
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, pulsosEnviados: pulsos}));
    });
  }
  else if (req.url === '/api/boxes' && req.method === 'GET') {
    const agora = Date.now();
    const lista = [];
    for (const nome in boxStatus) {
      const dados = boxStatus[nome];
      lista.push({
        nome: nome,
        online: dados.online && (agora - dados.ultimoPing) < 10000,
        ip: dados.ip
      });
    }
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(lista));
  }
  else if (req.url === '/api/historico' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(historicoPagamentos.slice(0, 100)));
  }
  else if (req.url.startsWith('/api/teste-pulso') && req.method === 'POST') {
    const url = new URL(req.url, 'http://' + req.headers.host);
    const nomeBox = url.searchParams.get('box');
    const qtd = Number(url.searchParams.get('qtd') || 0);
    filaPulsos[nomeBox] = (filaPulsos[nomeBox] || 0) + qtd;
    console.log('Teste: ' + qtd + ' pulsos para ' + nomeBox);
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
  }
  else if (req.url === '/api/zerar' && req.method === 'POST') {
    historicoPagamentos.length = 0;
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true}));
  }
  else {
    res.writeHead(404);
    res.end('Nao encontrado');
  }
});

servidor.listen(PORTA, () => {
  console.log('Servidor Jukebox Pix rodando na porta ' + PORTA);
});
