import { createServer, type Server } from 'node:http';

/**
 * Site de testes controlado do JARVIS WEB. Simula a página de candidatura de uma
 * empresa fictícia para provar o executor sem tocar em sites de terceiros.
 * Também expõe páginas-armadilha (CAPTCHA, login, redirecionamentos para rede interna).
 */

const BANNER = '<p class="banner">Site de testes do JARVIS Career — nada aqui é uma vaga real.</p>';

const page = (title: string, body: string) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b2430}
.banner{background:#fff4d6;border:1px solid #e8c56a;padding:8px 12px;border-radius:6px;font-size:14px}
label{display:block;margin-top:14px;font-weight:600}input,select,textarea{display:block;width:100%;margin-top:6px;padding:8px;font:inherit}
input[type=checkbox]{display:inline;width:auto}.check{font-weight:400}button{margin-top:20px;padding:10px 18px}</style>
</head><body>${BANNER}${body}</body></html>`;

const APPLY_FORM = page(
  'Candidatura — Analista de Suporte Júnior',
  `<h1>Analista de Suporte Júnior</h1>
<p>Empresa Exemplo · Curitiba, PR · Híbrido</p>
<form method="post" action="/vagas/42/enviar" enctype="multipart/form-data">
  <label for="first">Nome *</label><input id="first" name="first_name" required>
  <label for="last">Sobrenome *</label><input id="last" name="last_name" required>
  <label for="email">E-mail *</label><input id="email" name="email" type="email" required>
  <label for="phone">Telefone</label><input id="phone" name="phone" type="tel">
  <label for="city">Cidade</label><input id="city" name="city">
  <label for="resume">Currículo (PDF ou DOCX) *</label><input id="resume" name="resume" type="file" accept=".pdf,.docx" required>
  <label for="linkedin">Perfil do LinkedIn</label><input id="linkedin" name="linkedin" type="url">
  <label for="why">Por que você quer trabalhar na Empresa Exemplo? *</label><textarea id="why" name="why" required></textarea>
  <label for="gender">Gênero (opcional)</label>
  <select id="gender" name="gender"><option value="">Prefiro não informar</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select>
  <label class="check"><input type="checkbox" name="privacy" required> Li e aceito a política de privacidade da Empresa Exemplo *</label>
  <button type="submit">Enviar candidatura</button>
</form>`,
);

/**
 * Formulário no estilo dos ATS reais (padrões observados em páginas oficiais): lista de
 * sugestões com input auxiliar oculto, anexo atrás de um botão "Anexar", perguntas de
 * múltipla escolha em grupos, campo sobre quem indicou, documento e dados sensíveis.
 */
const ATS_FORM = page(
  'Candidatura — Analista de Dados Júnior',
  `<h1>Analista de Dados Júnior</h1>
<p>Empresa Exemplo · Curitiba, PR · Remoto</p>
<form>
  <div class="field"><label for="first_name">Nome*</label><input id="first_name" autocomplete="given-name" aria-required="true"></div>
  <div class="field"><label for="last_name">Sobrenome*</label><input id="last_name" autocomplete="family-name" aria-required="true"></div>
  <div class="field"><label for="email">E-mail*</label><input id="email" autocomplete="email" aria-required="true"></div>
  <div class="field"><label for="location">Localização (Cidade)*</label>
    <input id="location" role="combobox" autocomplete="off" aria-required="true">
    <input aria-hidden="true" tabindex="-1" required style="opacity:0;height:1px"></div>
  <div class="field"><div class="label">Currículo/CV*</div>
    <div class="upload-wrapper"><div class="buttons"><div class="btn"><div><label for="resume">Anexar</label><input id="resume" type="file" accept=".pdf,.docx" style="position:absolute;width:1px;height:1px;opacity:0"></div></div>
    <div class="btn"><label for="resume_text">Informe manualmente</label></div></div></div></div>
  <div class="field"><div class="label">Carta de apresentação</div>
    <div class="upload"><label for="cover" class="btn">Anexar</label><input id="cover" type="file" style="position:absolute;width:1px;height:1px;opacity:0"></div></div>
  <fieldset><legend>Como você conheceu a Empresa Exemplo? *</legend>
    <label class="check"><input type="checkbox" name="q1[]" id="q1a" required> Redes sociais</label>
    <label class="check"><input type="checkbox" name="q1[]" id="q1b" required> Indicação de amigos</label>
    <label class="check"><input type="checkbox" name="q1[]" id="q1c" required> Outro</label></fieldset>
  <fieldset><legend>Qual sua pretensão salarial? *</legend>
    <label class="check"><input type="checkbox" name="q2[]" required> Até R$ 4.000</label>
    <label class="check"><input type="checkbox" name="q2[]" required> Acima de R$ 4.000</label></fieldset>
  <fieldset><legend>Você aceita trabalho remoto? *</legend>
    <label class="check"><input type="radio" name="remote" value="sim" required> Sim</label>
    <label class="check"><input type="radio" name="remote" value="nao" required> Não</label></fieldset>
  <div class="field"><label for="ref_email">Caso seja indicação, informe o e-mail corporativo da pessoa que te indicou.</label><input id="ref_email"></div>
  <div class="field"><label for="company">Nome da empresa atual</label><input id="company"></div>
  <div class="field"><label for="cpf">Qual é o seu CPF?*</label><input id="cpf" aria-required="true"></div>
  <div class="field"><label for="a11y">Você precisa de alguma adaptação de acessibilidade?</label><input id="a11y"></div>
  <fieldset><legend>Consentimento</legend>
    <label class="check"><input type="checkbox" name="consent[]"> Eu concordo com o uso destes dados para o processo seletivo.</label></fieldset>
</form>`,
);

const ROUTES: Record<string, (res: import('node:http').ServerResponse) => void> = {
  '/vagas/77/aplicar': (res) => html(res, ATS_FORM),
  '/': (res) => html(res, page('Empresa Exemplo — vagas', '<h1>Vagas</h1><a href="/vagas/42">Analista de Suporte Júnior</a>')),
  '/vagas/42': (res) =>
    html(res, page('Analista de Suporte Júnior', '<h1>Analista de Suporte Júnior</h1><p>Suporte a usuários em Windows.</p><a href="/vagas/42/aplicar">Candidatar-se</a>')),
  '/vagas/42/aplicar': (res) => html(res, APPLY_FORM),
  '/captcha': (res) =>
    html(res, page('Verificação', '<h1>Confirme que você é humano</h1><div class="g-recaptcha" data-sitekey="site-de-testes"></div><form><input name="x"></form>')),
  '/login': (res) =>
    html(res, page('Entrar', '<h1>Entre para se candidatar</h1><form><label for="u">E-mail</label><input id="u"><label for="p">Senha</label><input id="p" type="password"></form>')),
  '/redirect-privado': (res) => redirect(res, 'http://169.254.169.254/latest/meta-data/'),
  '/redirect-externo': (res) => redirect(res, 'https://example.com/'),
  '/vazamento': (res) =>
    html(res, page('Recursos', '<h1>Página com recurso interno</h1><img src="http://127.0.0.1:5433/segredo.png" alt=""><img src="http://10.0.0.1/x.png" alt="">')),
};

function html(res: import('node:http').ServerResponse, body: string) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function redirect(res: import('node:http').ServerResponse, to: string) {
  res.writeHead(302, { location: to });
  res.end();
}

export function startTestSite(port = 4100, host = '127.0.0.1'): Promise<Server> {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'POST' && path === '/vagas/42/enviar') {
      // Consome o corpo e confirma — usado para validar o executor na Fase 5.
      req.resume();
      req.on('end', () => html(res, page('Candidatura recebida', '<h1>Candidatura recebida</h1><p>Protocolo: <strong>EX-2026-0042</strong></p>')));
      return;
    }
    const route = ROUTES[path];
    if (route) route(res);
    else {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('não encontrado');
    }
  });
  // Porta ocupada precisa rejeitar (o e2e reaproveita o site já rodando em dev).
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

// Execução direta: npm run test-site
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.ts')) {
  const port = Number(process.env.TEST_SITE_PORT ?? 4100);
  void startTestSite(port).then(() => console.log(`Site de testes do JARVIS em http://127.0.0.1:${port}/vagas/42/aplicar`));
}
