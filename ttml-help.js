// modules
const fs = require('fs');
const request = require('request');
const shlp = require('sei-helper');
const { ttml2srt } = require('ttml2srt');

// start
getStream();

// program
async function getStream(){
    let xmlUrl  = await shlp.question(`ttml url`);
    let file    = await shlp.question(`srt filename`);
    let xmlData = await getData(xmlUrl);
    let xmlBody = xmlData.res.body;
    process.chdir(`${__dirname}/downloads/`);
    fs.writeFileSync(file+'.srt',ttml2srt(xmlBody));
}

// request
function getData(options){
    return new Promise((resolve) => {
        request(options, (err, res) => {
            if (err){
                res = err;
                resolve({ "err": "0", res });
            }
            if (res.statusCode != 200 && res.statusCode != 403) {
                resolve({ "err": res.statusCode, res });
            }
            resolve({res});
        });
    });
}