
module.exports = {
    compileTemplate: compileTemplate
};


function compileTemplate(tpl) {
    let lvl = [];
    let tpl_parts = [];
    let last = 0;
    
    const cut = (a, b) => {
        tpl_parts.push(tpl.substring(last, a));
        last = b;
    }

    function go(i, level) {
        let step = -1;  // 0 - text, 1 - element begin, 2 - el. end, 8 - comment
        let index = 0;
        let ident = -1;
        let space = 0;
        let controls = [];
        let text_start = 0;
        let text_bindings = false;

        const addText = (end) => {
            end = end || i;
            if(!text_bindings) return;
            text_bindings = false;
            lvl[level] = index;
            controls.push({
                type: 'text',
                code: tpl.substring(text_start, end),
                lvl: lvl.filter(x => x != null)
            });
            cut(text_start, end);
            tpl_parts.push(' ');
        }
    
        for(;i < tpl.length;i++) {
            let a = tpl[i];
            let a2 = tpl.substring(i, i + 2);
            let a3 = tpl.substring(i, i + 3);
            let a4 = tpl.substring(i, i + 4);
            let b2 = tpl.substring(i - 1, i + 1);
            let b3 = tpl.substring(i - 2, i + 1);

            if(a === ' ') space = i;

            if(step === 8) {
                if(b3 === '-->') {
                    step = -1;
                    index++;
                }
                continue;
            }

            if(step === 2) {
                if(a === '>') {
                    //step = -1;
                    //index++;
                    lvl[level] = null;
                    return {
                        i: i,
                        controls: controls
                    };
                }
                continue;
            }

            if(step === 0 || step === 1 || step == -1) {
                if(ident >= 0) {
                    if(a === '}') {
                        lvl[level] = index;
                        let name = tpl.substring(ident, i + 1);

                        if(step === 1) {
                            cut(ident, i + 1);
                            controls.push({
                                type: 'prop',
                                code: name,
                                lvl: lvl.filter(x => x != null)
                            })
                        } else {
                            if(name.substring(0, 7) === '{#each ') {
                                addText(ident);
                                index++;

                                lvl[level] = index;
                                let start = i + 1;
                                let end = tpl.substring(start).indexOf('{/each}');
                                if(end == -1) throw 'no end of loop';
                                end += start;
                                let loop_tpl = tpl.substring(start, end);

                                i = end + 7;
                                cut(ident, i);
                                tpl_parts.push('<!-- ' + name + ' -->');

                                controls.push({
                                    type: 'loop',
                                    code: name,
                                    lvl: lvl.filter(x => x != null),
                                    data: compileTemplate(loop_tpl.trim())
                                });
                                index++;
                                ident = -1;
                                step = -1;
                                continue;
                            }
                            text_bindings = true;
                        }

                        ident = -1;
                    }
                    continue;
                }
                if(a === '{') {
                    if(step === 1) ident = space + 1;
                    else ident = i;
                    if(step === -1) {
                        step = 0;
                        text_start = i;
                    }
                    continue;
                }
            }

            if(step === 1) {
                if(a === '>') {
                    if(b2 === '/>') {
                        step = -1;
                        index++;
                        continue
                    }
                    lvl[level] = index;
                    let r = go(i + 1, level + 1);
                    i = r.i;
                    controls = controls.concat(r.controls);
                    step = -1;
                    index++;
                    continue;
                }
                continue;
            }

            if(a === '<') {
                if(step === 0) addText();

                if(a2 === '</') {
                    step = 2;
                    continue;
                }

                if(step !== -1) index++;

                if(a4 === '<!--') {
                    step = 8;
                    continue;
                }

                step = 1;

            } else {
                if(step === -1) {
                    step = 0;
                    text_start = i;
                }
            }
        }

        return {
            controls: controls
        }
    }

    let r = go(0, 0);
    cut(tpl.length, tpl.length);
    let tpl_result = tpl_parts.join('');

    return {
        controls: r.controls,
        template: tpl_result
    }
}
