const http = require('http');

const PORTA = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('✅ Jukebox Pix está funcionando!');
  } else if (req.url === '/api/webhook-pagbank' && req.method === 'POST') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({ok: true, mensagem: 'Webhook recebido!'}));
  } else {
    res.writeHead(404);
    res.end('Não encontrado');
  }
});

server.listen(PORTA, () => {
  console.log('✅ Servidor rodando na porta', PORTA);
});
