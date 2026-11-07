const http = require('http');

const PORTA = process.env.PORT || 3000;

const servidor = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ Jukebox Pix funcionando!');
  } else if (req.url === '/api/webhook-pagbank' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mensagem: 'Recebido!' }));
  } else {
    res.writeHead(404);
    res.end('Página não encontrada');
  }
});

servidor.listen(PORTA, () => {
  console.log('🚀 Servidor rodando na porta', PORTA);
});
