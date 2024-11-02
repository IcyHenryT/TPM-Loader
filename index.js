const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cliProgress = require('cli-progress');
const { spawn } = require('child_process');

let osName = os.platform();

if (osName == 'win32') osName = 'win.exe';
else if (osName == 'darwin') osName = 'macos';

const currentPath = process.cwd();

async function getNewestTPM() {
    return new Promise(async (resolve, reject) => {
        fs.readdir(currentPath, (err, files) => {
            if (err) {
                console.error('Hi i died', err);
                reject(err);
            }

            files = files.filter(file => /^TPM-\d+\.\d+\.\d+-(linux|macos|win\.exe)$/.test(file));
            //console.log(`Files: ${files}`)
            if (files.length == 0) {
                //console.log(`found no TPM files`)
                resolve({});
            }

            let newestVersion = 0;
            let newestPath = null;

            for (const file of files) {
                const filePath = path.resolve(currentPath, file);
                const version = parseInt((file.match(/^TPM-(\d+\.\d+\.\d+)-(linux|macos|win\.exe)$/)[1]).replace(/\./g, ''));
                //console.log(`${file} is version ${version}`);
                if (newestVersion < version) {
                    if (newestPath) fs.unlinkSync(newestPath)
                    newestVersion = version;
                    newestPath = filePath;
                } else {
                    fs.unlinkSync(filePath);
                }
            };

            resolve({ newPath: newestPath, vers: newestVersion });
        });
    })
}

(async () => {
    const latestVer = (await axios.get('https://api.github.com/repos/IcyHenryT/TPM-rewrite/releases/latest'))?.data?.tag_name;

    if (!latestVer) {
        console.error(`Failed to check for auto update. Launching bot`);
        startTPM();
        return;
    }

    const newest = await getNewestTPM(latestVer);
    const { newPath, vers } = newest;

    if (parseInt(latestVer.replace(/\./g, '')) !== vers) {
        console.log(`Downloading new TPM update! (This may take a second)`);
        await downloadExe(latestVer);
        setTimeout(() =>{
            console.log('\n')
            runExecutable(path.resolve(currentPath, `TPM-${latestVer}-${osName}`));
        
            if (newPath) fs.unlinkSync(newPath);
        }, 150)
    } else {
        console.log(`TPM up to date! Launching bot`);
        runExecutable(path.resolve(currentPath, `TPM-${latestVer}-${osName}`));
        return;
    }

})();

function runExecutable(executablePath) {
    const child = spawn('"' + executablePath + '"', { stdio: 'inherit', shell: true });

    child.on('error', (error) => {
        console.error('tpm died :( ', error);
    });
}

async function downloadExe(latestVer) {

    //console.log('starting to download');
    const tempPath = path.resolve(currentPath, `TPM-${latestVer}-${osName}`)
    //console.log('hey')
    const writer = fs.createWriteStream(tempPath);

    const url = `https://github.com/IcyHenryT/TPM-rewrite/releases/download/${latestVer}/TPM-rewrite-${osName}`;

    const exeDownload = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    const totalSize = parseInt(exeDownload.headers['content-length'], 10);
    const progressBar = new cliProgress.SingleBar({
        format: 'Downloading |{bar}| {percentage}% | {value}/{total} bytes',
    }, cliProgress.Presets.shades_classic);

    progressBar.start(totalSize, 0);

    let downloadedSize = 0;
    exeDownload.data.on('data', (chunk) => {
        downloadedSize += chunk.length;
        progressBar.update(downloadedSize);
    });
    //console.log('hi')
    exeDownload.data.pipe(writer);
    //console.log('hi again')
    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            if (osName !== 'win.exe') {
                fs.chmod(tempPath, 0o755, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
        writer.on('error', reject);
    });
}