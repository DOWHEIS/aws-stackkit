import {spawn} from "child_process";

export function runCommand(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { cwd, stdio: 'inherit' })
        proc.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
        })
        proc.on('error', (err) => reject(err))
    })
}