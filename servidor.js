const http = require('http');
const PORT = process.env.PORT || 3000;

const filaPulsos = {};

const servidor = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    return res.end('Jukebox Pix esta funcionando! ' + new Date().toLocaleString('pt-BR'));
  }

  if (req.url.startsWith('/api/teste-pulso')) {
    const partes = req.url.split('?box=');
    if (partes.length < 2) { res.end('erro'); return; }
    const boxEQuant = partes[1].split('&qtd=');
    if (boxEQuant.length < 2) { res.end('erro'); return; }
    const box = boxEQuant[0];
    const qtd = parseInt(boxEQuant[1]);
    
    filaPulsos[box] = qtd;
    console.log('✅ Pulso guardado: ' + box + ' = ' + qtd);
    
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({ok: true, box: box, pulsos: qtd}));
  }

  if (req.url.startsWith('/webhook-esp32')) {
    const partes = req.url.split('?box=');
    const box = partes.length > 1 ? partes[1] : '';
    const valor = filaPulsos[box] || 0;
    filaPulsos[box] = 0;
    res.writeHead(200, {'Content-Type': 'text/plain'});
    return res.end(String(valor));
  }

  res.writeHead(404);
  res.end('Nao encontrado');
});

servidor.listen(PORT, () => {
  console.log('Servidor rodando na porta ' + PORT);
});


