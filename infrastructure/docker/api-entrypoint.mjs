// Starts the API and, when EMBEDDED_WORKER=true, the Worker in the same container.
// Single-container hosts (such as one Render web service) have no separate
// process for queued email, PDF and export jobs; without it those jobs never run.
import { spawn } from 'node:child_process'

const processes = [{ name: 'api', cwd: '/app' }]
if (process.env.EMBEDDED_WORKER === 'true') {
  processes.push({ name: 'worker', cwd: '/worker' })
}

const children = processes.map(({ name, cwd }) => {
  const child = spawn(process.execPath, ['dist/main.js'], {
    cwd,
    env: process.env,
    stdio: 'inherit'
  })
  // Either process stopping takes the container down so the host restarts both.
  child.on('exit', (code, signal) => {
    console.error(`${name} exited (${signal ?? code})`)
    for (const other of children) if (other !== child) other.kill('SIGTERM')
    process.exit(code ?? 1)
  })
  return child
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal)
  })
}
