const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-dias-trabalhados-2';

if (!projectId.startsWith('demo-')) {
  console.error(`Execução de testes bloqueada: o projeto "${projectId}" não é um projeto demo-*.`);
  process.exit(1);
}

if (projectId === 'dias-trabalhados-bf99a') {
  console.error('Execução de testes bloqueada: o project ID de produção foi informado.');
  process.exit(1);
}
