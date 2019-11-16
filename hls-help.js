#!/usr/bin/env node

// build-in
const fs = require('fs');
const url = require('url');
const path = require('path');
const querystring = require('querystring');

// modules
const got = require('got').extend({
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:65.0) Gecko/20100101 Firefox/65.0' },
});

// extra
const yargs = require('yargs');
const m3u8 = require('m3u8-parsed');
const hlsdl = require('hls-download');
const shlp = require('sei-helper');
const cfg = require(path.join(__dirname,'/config.json'));

// req
let fullUrl          = '';
let baseUrl          = '';
let quality          = '';
let file             = '';
let parts            = 10;
let appendStream     = false;
let isStream         = false;
let setCustomBaseUrl = true;
let canResume        = true;

// dl data
let mystreamCfg      = {};
let mystream         = false;
let dlDir            = cfg.workDir;

// stream
let dledSeg  = 0;
let firstSeg = 0;
let startSeg = 0;
let lastSeg  = 0;
let segCount = 0;
let nextSeg  = 0;

// cfg
let m3u8cfg;
let getM3u8Sheet;

// args
let argv = yargs
    // base
    .wrap(Math.min(100))
    .usage('Usage: $0 [options]')
    .help(false).version(false)
    // main
    .describe('url','set dl url')
    .describe('file','set output file')
    .describe('setbase','use own base url')
    .describe('baseurl','set own base url')
    // help
    .describe('help','Show this help')
    .boolean('help')
    .alias('help','h')
    .argv;

// start
// main
(async function(){
    await getStream();
}());

// program
async function getStream(){
    // set dl dir
    process.chdir(dlDir);
    // set url
    fullUrl = argv.url || await shlp.question(`[Q] m3u8 video url`);
    getM3u8Sheet = await getData({url:fullUrl});
    // parse data
    if(getM3u8Sheet.ok){
        m3u8cfg = m3u8(getM3u8Sheet.res.body);
        if(m3u8cfg.segments && m3u8cfg.segments.length>0){
            await dlStream(m3u8cfg,fullUrl);
        }
        else if(m3u8cfg.playlists){
            if(m3u8cfg.mediaGroups && m3u8cfg.mediaGroups.AUDIO){
                let audioArr  = m3u8cfg.mediaGroups.AUDIO;
                let audioKeys = Object.keys(audioArr);
                if(audioKeys.length>0){
                    let audioArrMainKey = audioKeys[0];
                    audioArr  = m3u8cfg.mediaGroups.AUDIO[audioArrMainKey];
                    audioKeys = Object.keys(audioArr);
                    for(let a in audioKeys){
                        m3u8cfg.playlists.push(audioArr[audioKeys[a]]);
                    }
                }
            }
            console.log(`[INFO] Streamlist:`);
            for(let v in m3u8cfg.playlists){
                let plEl = m3u8cfg.playlists[v];
                let plAt = plEl.attributes ? plEl.attributes : {};
                let resolution = plAt.RESOLUTION ? `${plAt.RESOLUTION.width}x${plAt.RESOLUTION.height}` : `????x????`;
                let BANDWIDTH  = plAt.BANDWIDTH  ? Math.round(plAt.BANDWIDTH/1024) : `????`;
                console.log(
                    `[${v}] ${resolution} (${BANDWIDTH}KiB/s)`,
                    '\n `-'+m3u8cfg.playlists[v].uri
                );
            }
            quality = await shlp.question(`[Q] Stream number`);
            plUri = m3u8cfg.playlists[quality].uri;
            fullUrl = (!plUri.match(/^http/) ? genBaseUrl(fullUrl) : '') + plUri;
            console.log(`[INFO] Requested URL:`, fullUrl);
            getM3u8Sheet = await getData({url:fullUrl});
            if(getM3u8Sheet.ok){
                m3u8cfg = m3u8(getM3u8Sheet.res.body);
                await dlStream(m3u8cfg,fullUrl);
            }
        }
        else{
            console.log(m3u8cfg);
        }
    }
}

function genBaseUrl(fullUrl){
    return fullUrl.replace(fullUrl.split('/')[fullUrl.split('/').length-1],'');
}

// dl
async function dlStream(m3u8cfg,fullUrl){
    // prepare
    file = file == '' ? ( argv.file || await shlp.question(`[Q] .ts filename`) ) : file;
    if(setCustomBaseUrl){
        setCustomBaseUrl = false;
        let setBase = argv.setbase || await shlp.question(`[Q] Do you want enter custom base url? (y/N)`);
        if(['Y', 'y'].includes(setBase)){
            let newBase = argv.baseurl || await shlp.question(`[Q] Base url`);
            baseUrl = new URLSearchParams(`url=${newBase.replace(/&(amp;)?/g,'&amp;')}`).get('url');
        }
        else{
            baseUrl = genBaseUrl(fullUrl)
        }
    }
    // fix not stream data
    if(typeof m3u8cfg.mediaSequence != 'number'){
        m3u8cfg.mediaSequence = 0;
    }
    if(m3u8cfg.mediaSequence == 1 && m3u8cfg.endList){
        m3u8cfg.mediaSequence = 0;
    }
    // resume
    let streamOffset = 0;
    if(canResume && fs.existsSync(`${file}.ts`) && fs.existsSync(`${file}.ts.resume`)){
        try{
            let resume = JSON.parse(fs.readFileSync(`${file}.ts.resume`, 'utf-8'));
            if(m3u8cfg.mediaSequence > 0){
                nextSeg = resume.completed + 1;
            }
            else{
                streamOffset = resume.completed;
            }
            appendStream = true;
        }
        catch(e){}
    }
    // stream
    if(m3u8cfg.mediaSequence > 0){
        isStream = true;
    }
    if(m3u8cfg.mediaSequence > 0){
        // stream status
        dledSeg  = nextSeg > 0 ? nextSeg - 1 : 0;
        firstSeg = m3u8cfg.mediaSequence;
        startSeg = nextSeg > 0 ? nextSeg : firstSeg;
        lastSeg  = firstSeg + m3u8cfg.segments.length;
        segCount = dledSeg < firstSeg ? m3u8cfg.segments.length : lastSeg - dledSeg;
        // log stream data
        console.log(`[INFO] ~ Stream download status ~`);
        console.log(`  Last downloaded segment: ${dledSeg}`);
        console.log(`  Segments range         : ${startSeg} (${firstSeg}) - ${lastSeg}`);
        console.log(`  Segments count         : ${segCount}`);
        // update
        m3u8cfg.mediaSequence = startSeg;
        nextSeg               = lastSeg + 1;
        m3u8cfg.segments = m3u8cfg.segments.slice(m3u8cfg.segments.length - segCount);
    }
    // dl
    mystreamCfg = {
        fn: file,
        baseurl: baseUrl,
        m3u8json: m3u8cfg,
        pcount: parts,
        rcount: 10,
        partsOffset: streamOffset,
        typeStream: appendStream,
    };
    mystream = await hlsdl(mystreamCfg);
    if(mystream){
        if(canResume && fs.existsSync(`${file}.ts.resume`)){
            fs.unlinkSync(`${file}.ts.resume`);
            canResume = false;
        }
        console.log(mystream);
    }
    else if(mystream && !mystream.ok){
        let newResume = mystream.parts;
        newResume.completed += dledSeg;
        fs.writeFileSync(`${file}.ts.resume`, JSON.stringify(newResume));
        console.log(mystream);
        process.exit(1);
    }
    // update stream
    if(isStream && !m3u8cfg.endList){
        appendStream = true;
        await updateStream(m3u8cfg,fullUrl);
    }
}
async function updateStream(m3u8cfg,fullUrl){
    console.log(`[INFO] Fetch update...`);
    getM3u8Sheet = await getData({url:fullUrl});
    if(!getM3u8Sheet.ok){
        console.log(`[ERROR] Fail to get new playlist...`);
        process.exit(1);
    }
    
    m3u8cfg = m3u8(getM3u8Sheet.res.body);
    
    firstSeg = m3u8cfg.mediaSequence;
    lastSeg  = firstSeg + m3u8cfg.segments.length;
    segCount = lastSeg - nextSeg + 1;
    
    if(segCount > 0){
        await dlStream(m3u8cfg,fullUrl);
    }
    else{
        await delay(2000);
        await updateStream(m3u8cfg,fullUrl);
    }
}
function delay(s) {
    return new Promise(resolve => setTimeout(resolve, s));
}

// request
async function getData(options){
    if(options && !options.headers){
        options.headers = {};
    }
    if(options.url.startsWith('file://')){
        try {
            let getFileContent = fs.readFileSync(url.fileURLToPath(options.url));
            return {
                ok: true,
                res: {
                    body: getFileContent,
                }
            };
        }
        catch(error){
            console.log(error);
            return {
                ok: false,
                error
            };
        }
    }
    try{
        let res = await got(options);
        return {
            ok: true,
            res
        };
    }
    catch(error){
        if(error.statusCode && error.statusMessage){
            console.log(`[ERROR] ${error.name} ${error.statusCode}: ${error.statusMessage}`);
        }
        else{
            console.log(`[ERROR] ${error.name}: ${error.code}`);
        }
        return {
            ok: false,
            error
        };
    }
}
