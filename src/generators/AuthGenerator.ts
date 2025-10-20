// import path from 'path'
// import fs from 'fs-extra'
// import { fileURLToPath } from 'url'
// import { Generator } from './Generator.js'
// import { ApiDefinition } from '../models/ApiDefinition.js'
// import { logger } from '../services/Logger.js'
//
// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)
//
// export class AuthGenerator implements Generator {
//     async generate(api: ApiDefinition, outputDir: string): Promise<void> {
//         const wrappedDir = path.join(outputDir, 'wrapped')
//
//         logger.section(`Generating auth components for ${api.name}...`)
//
//         await this.copyAuthHandlers(wrappedDir)
//     }
//
//     private async copyAuthHandlers(wrappedDir: string): Promise<void> {
//         await this.copyAuthLoginHandler(wrappedDir)
//         await this.copyAuthApproveHandler(wrappedDir)
//     }
//
//     private async copyAuthLoginHandler(wrappedDir: string): Promise<void> {
//         const srcInternalLogin = path.resolve(__dirname, '../internal/authPrelogin.ts')
//         const destDir = path.join(wrappedDir, '__internal__', 'auth_login')
//         const destFile = path.join(destDir, 'index.ts')
//
//         await fs.ensureDir(destDir)
//         await fs.copyFile(srcInternalLogin, destFile)
//
//         logger.info(`Copied internal /auth/preLogin handler → ${destFile}`)
//     }
//
//     private async copyAuthApproveHandler(wrappedDir: string): Promise<void> {
//         const srcInternalApprove = path.resolve(__dirname, '../internal/authApprove.ts')
//         const destDir = path.join(wrappedDir, '__internal__', 'auth_approve')
//         const destFile = path.join(destDir, 'index.ts')
//
//         await fs.ensureDir(destDir)
//         await fs.copyFile(srcInternalApprove, destFile)
//
//         logger.info(`Copied internal /auth/approve handler → ${destFile}`)
//     }
// }
