const acorn = require('acorn');
const astring = require('astring');
const fs = require('fs');

const templateLib = require('./template.js');
const compileTemplate = templateLib.compileTemplate;


function main() {
    let inputFile = process.argv[2] || './app.html';
    const src = fs.readFileSync(inputFile, {encoding:'utf8', flag:'r'}); 
    const result = compile(src);
    fs.writeFileSync('./bin/output.js', result, {encoding:'utf8', flag:'w'}); 
}


function compile(data) {
    let p = data.match(/<script>([\s\S]*)<\/script>([\s\S]*)/i);

    let jsSource = compileJS(p[1]);
    let tplData = compileTemplate(p[2]);
    let uniqIndex = 0;

    let runtime = `
        var $$__apply;
        function $$apply() {
            if($$apply.planned) return;
            $$apply.planned = true;
            setTimeout(() => {
                $$apply.planned = false;
                $$__apply();
            }, 1);
        };

        (function() {
            function CD() {
                let $$ = {children: [],watchers: []};
                $$.wf = function(fn, callback) {
                    $$.watchers.push({fn: fn, cb: callback, value: undefined});
                };
                $$.wa = function(fn, callback) {
                    $$.watchers.push({fn: fn, cb: callback, value: undefined, a: true})
                };
                return $$;
            };
        
            let $cd = CD();
    
            const arrayCompare = (a, b) => {
                let e0 = a == null || !a.length;
                let e1 = b == null || !b.length;
                if(e0 !== e1) return true;
                if(e0 === true) return false;
                if(a.length !== b.length) return true;
                for(let i=0;i<a.length;i++) {
                    if(a[i] !== b[i]) return true;
                }
                return false;
            };
            $$__apply = () => {
                let loop = 10;
                while(loop >= 0) {
                    let changes = 0;
                    let cd;
                    for(let cdIndex=-1;cdIndex<$cd.children.length;cdIndex++) {
                        if(cdIndex == -1) cd = $cd;
                        else cd = $cd.children[cdIndex];
                        cd.watchers.forEach((w) => {
                            let value = w.fn();
                            if(w.a) {
                                if(arrayCompare(w.value, value)) {
                                    w.value = value.slice();
                                    changes++;
                                    w.cb(w.value);
                                }
                            } else {
                                if(w.value !== value) {
                                    w.value = value;
                                    changes++;
                                    w.cb(w.value);
                                }
                            }
                        });
                    }
                    loop--;
                    if(!changes) break;
                }
            };
        `;

    runtime += ';$element.innerHTML = `' + Q(tplData.template) + '`;\n';

    function Q(s) {
        return s.replace(/`/g, '\\`');
    };

    let r = buildRender(tplData.controls);
    runtime += r.src;
    runtime += r.name + '($cd, $element);\n';
    runtime += `\n\n$$apply();})();`;
    
    function buildRender(controls, lvlShift) {
        const renderName = 'render' + (uniqIndex++);
        let src = 'function ' + renderName + '($cd, $element) {\n';

        controls.forEach(cc => {
            console.log(renderName, cc);
    
            let lvl = cc.lvl;
            if(lvlShift) lvl = lvl.slice(1);
            let el = '$element';
            for(let i=0;i<lvl.length;i++) {
                el += '.childNodes[' + lvl[i] + ']';
            }
    
            if(cc.type === 'prop') {
                let x = cc.code.match(/(\w+):([\w\|\.]+)=\{([^\}]*)\}/);
                if(x[1] === 'on') {
                    let eventProps = x[2].split('|');
                    let event = eventProps[0];
                    let exp;
                    if(eventProps[1] === 'preventDefault') exp = '{e.preventDefault(); ' + x[3] + '}';
                    else exp = '{' + x[3] + '}';
                    src += el + '.addEventListener("' + event + '", (e) => {$$apply();' + exp + '});\n';;
                } else if(x[1] === 'bind') {
                    let key = x[2];
                    let exp = x[3];
                    if(key === 'value') {
                        src += el + '.addEventListener("input", (e) => {' + exp + '=e.target.value;$$apply();});\n';
                        src += '$cd.wf(() => ' + exp + ', function(value) {var el = ' + el + ';if(el.value !== value) el.value = value;});\n';
                    } else if(key === 'checked') {
                        src += el + '.addEventListener("input", (e) => {' + exp + '=e.target.checked;$$apply();});\n';
                        src += '$cd.wf(() => !!(' + exp + '), function(value) {var el = ' + el + ';if(el.checked !== value) el.checked = value;});\n';
                    } else throw 'Error binding: ' + cc.code;
                } else if(x[1] === 'class') {
                    let className = x[2];
                    let exp = x[3];
                    src += '$cd.wf(() => !!(' + exp + '), function(value) {var el = ' + el + '; if(value) el.classList.add("' + className + '"); else el.classList.remove("' + className + '"); });\n';
                } else throw 'Error prop: ' + cc.code;
            } else if(cc.type === 'text') {
                // code lvl
                let r = cc.code.match(/^([\S\s]*)\{([^\}]+)\}([\S\s]*)$/);
                src += '$cd.wf(() => `' + Q(r[1]) + '`+' + r[2] + '+`' + Q(r[3]) + '`, function(t) {' + el + '.textContent = t;});\n';
            } else if(cc.type === 'loop') {
                let r = cc.code.match(/\{#each\s+(\w+)\s+as\s+(\w+)\s*\}/);
                const arrayName = r[1];
                const itemName = r[2];
                const rootElementName = cc.data.template.match(/^<([^> ]+)/)[1];
    
                src += `(function(){
                          const top = ${Q(el)};
                          let srcNode = document.createElement("div");\nsrcNode.innerHTML=\`${Q(cc.data.template)}\`;
                          srcNode=srcNode.firstChild;
                          let mapping = new Map();
                          $cd.wa(() => ${Q(arrayName)}, (array) => {
                            let prevNode = top;
                            let newMapping = new Map();

                            if(mapping.size) {
                                let arrayAsSet = new Set();
                                for(let i=0;i<array.length;i++) {
                                    arrayAsSet.add(array[i]);
                                }
                                mapping.forEach((ctx, item) => {
                                    if(arrayAsSet.has(item)) return;
                                    ctx.el.remove();
                                    let i = $cd.children.indexOf(ctx.cd);
                                    i>=0 && $cd.children.splice(i, 1);
                                });
                                arrayAsSet.clear();
                            }

                            array.forEach(${Q(itemName)} => {\n`;
    
                let builderName;
                if(cc.data.controls.length) {
                    let r = buildRender(cc.data.controls, true);
                    builderName = r.name;
                    src += r.src;
                }

                src += `      let el, ctx = mapping.get(${Q(itemName)});
                            if(ctx) {
                                el = ctx.el;
                            } else {
                                el = srcNode.cloneNode(true);
                                let childCD = CD(); $cd.children.push(childCD);
                                ctx = {el: el, cd: childCD};
                                render1(childCD, el);
                            }
                            if(el.previousSibling != prevNode) {
                                if(el.previousSibling) el.previousSibling.remove();
                                if(el.previousSibling != prevNode) top.parentNode.insertBefore(el, prevNode.nextSibling);
                            }
                            prevNode = el;
                            newMapping.set(${Q(itemName)}, ctx);
                          });
                          mapping.clear(); mapping = newMapping;
                          });
                        })();\n`;
            }
        });

        src += '};\n';
        return {
            name: renderName,
            src: src
        };
    };

    return jsSource.split('$$runtime()').join(runtime);
};

main();



function compileJS(code) {
    var ast = acorn.parse(code, { ecmaVersion: 6 })

    const funcTypes = {
        FunctionDeclaration: 1,
        FunctionExpression: 1,
        ArrowFunctionExpression: 1
    }
    
    const fix = (node) => {
        if(funcTypes[node.type] && node.body.body && node.body.body.length) {
            node.body.body.unshift({
                type: 'ExpressionStatement',
                expression: {
                    callee: {
                        type: 'Identifier',
                        name: '$$apply'
                    },
                    type: 'CallExpression'
                }
            });
        }
    }
    
    const transform = function(node) {
        const x = 0;
        for(let key in node) {
            let value = node[key];
            if(typeof value === 'object') {
                if(Array.isArray(value)) {
                    value.forEach(transform);
                } else if(value && value.type) {
                    transform(value);
                }
            }
        }
        fix(node);
    };
    
    transform(ast.body);

    ast.body.push({
        type: 'ExpressionStatement',
        expression: {
            callee: {
                type: 'Identifier',
                name: '$$runtime'
            },
            type: 'CallExpression'
        }
    });
    
    ast.body = [{
        body: {
            type: 'BlockStatement',
            body: ast.body
        },
        id: {
            type: 'Identifier"',
            name: 'widget'
        },
        params: [{
            type: 'Identifier',
            name: '$element'
        }],
        type: 'FunctionDeclaration'
    }];
    
    return astring.generate(ast);
}

