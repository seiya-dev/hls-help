#!/usr/bin/env node

// build-in
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');

// modules
const got = require('got').extend({
    headers: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:65.0) Gecko/20100101 Firefox/65.0' },
});

// extra
const m3u8 = require('m3u8-parsed');
const hlsdl = require('hls-download');
const shlp = require('sei-helper');

// req
let fullUrl          = '';
let baseUrl          = '';
let quality          = '';
let file             = '';
let parts            = 10;
let isStream         = false;
let setCustomBaseUrl = true;

// cfg
let m3u8cfg;
let m3u8cfgUpd;
let getM3u8Sheet;

// start
getStream();

// program
async function getStream(){
    // set url
    fullUrl = await shlp.question(`[Q] m3u8 video url`);
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
    process.chdir(`${__dirname}/downloads/`);
    file = file == '' ? await shlp.question(`[Q] .ts filename`) : file;
    if (!isStream) {
        isStream = (['Y', 'y'].includes(await shlp.question(`[Q] This is livestream? (y/N)`)));
    }
    if(setCustomBaseUrl){
        setCustomBaseUrl = false;
        if(['Y', 'y'].includes(await shlp.question(`[Q] Do you want enter custom base url? (y/N)`))){
            baseUrl  = querystring.parse('url='+(await shlp.question(`[Q] Base url`)))['url'];
        }
        else{
            baseUrl  = genBaseUrl(fullUrl)
        }
    }

    let mystream = await hlsdl({ 
        fn: file,
        baseurl: baseUrl, 
        m3u8json: m3u8cfg, 
        pcount: parts, 
        rcount: 10, 
        typeStream: isStream
    });
    console.log(mystream);
    if(isStream){
        console.log(`[INFO] Fetch update...`);
        await updateStream(m3u8cfg,fullUrl);
    }
}
async function updateStream(m3u8cfg,fullUrl){
    while (true) {
        getM3u8Sheet = await getData({url:fullUrl});
        if(!getM3u8Sheet.ok){
            process.exit(1);
        }
        m3u8cfgUpd = m3u8(getM3u8Sheet.res.body);
        let lastSegUrl = {
            dld: m3u8cfg.segments[m3u8cfg.segments.length-1].uri,
            upd: m3u8cfgUpd.segments[m3u8cfgUpd.segments.length-1].uri
        };
        if (lastSegUrl.dld == lastSegUrl.upd) {
            await delay(2000);
            continue;
        }
        let oldUrls = {};
        m3u8cfg.segments.forEach(s => oldUrls[s.uri] = 1);
        m3u8cfg = m3u8cfgUpd;
        m3u8cfg.segments = m3u8cfg.segments.filter(s => !(s.uri in oldUrls));
        await dlStream(m3u8cfg,fullUrl);
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
