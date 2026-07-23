import { readdirSync, readFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
  console.error(`Restrição de plano gratuito violada: ${message}`);
  process.exitCode = 1;
}

const firebaseConfig = readJson('firebase.json');
const firebaseProjects = readJson('.firebaserc').projects || {};
const workflowDirectory = '.github/workflows';
const workflows = readdirSync(workflowDirectory)
  .filter(name => /\.ya?ml$/i.test(name))
  .sort()
  .map(name => ({
    name,
    source: readFileSync(`${workflowDirectory}/${name}`, 'utf8')
  }));
const deployWorkflow = workflows.find(workflow => workflow.name === 'deploy.yml')?.source || '';

if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_PATH) {
  const event = readJson(process.env.GITHUB_EVENT_PATH);
  if (event.repository?.private !== false) {
    fail('GitHub Pages no plano Free exige que este repositório permaneça público.');
  }
}

const firebaseSectionsThatRequireBilling = ['apphosting', 'extensions', 'functions', 'storage'];
for (const section of firebaseSectionsThatRequireBilling) {
  if (Object.hasOwn(firebaseConfig, section)) {
    fail(`firebase.json não pode configurar "${section}" sem revisão explícita do custo.`);
  }
}

for (const [alias, projectId] of Object.entries(firebaseProjects)) {
  if (!String(projectId).startsWith('demo-')) {
    fail(`o alias Firebase "${alias}" aponta para "${projectId}", não para um projeto demo.`);
  }
}

for (const workflow of workflows) {
  const runners = [...workflow.source.matchAll(/^\s*runs-on:\s*(.+)\s*$/gm)]
    .map(match => match[1].trim().replaceAll(/['"]/g, ''));
  for (const runner of runners) {
    if (runner !== 'ubuntu-latest') {
      fail(`o runner "${runner}" em ${workflow.name} não faz parte da configuração gratuita aprovada.`);
    }
  }

  if (/firebase\s+deploy|gcloud\s+(?:app|functions|run)\s+deploy/i.test(workflow.source)) {
    fail(`${workflow.name} não pode publicar serviços Firebase ou Google Cloud.`);
  }

  const actionReferences = [...workflow.source.matchAll(/^\s*uses:\s*([^#\s]+)\s*(?:#.*)?$/gm)]
    .map(match => match[1]);
  for (const reference of actionReferences) {
    if (!/@[0-9a-f]{40}$/i.test(reference)) {
      fail(`a Action "${reference}" em ${workflow.name} deve ser fixada por SHA completo.`);
    }
  }
}

if (!/path:\s*\.\/dist\b/.test(deployWorkflow)) {
  fail('o deploy do Pages deve publicar exclusivamente a pasta dist.');
}

if (!/github\.event_name == 'push' && github\.ref == 'refs\/heads\/master'/.test(deployWorkflow)) {
  fail('o deploy do Pages deve permanecer restrito a push na branch master.');
}

if (!process.exitCode) {
  console.log('Configuração compatível com GitHub Free e Firebase Spark.');
}
