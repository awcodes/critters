import esbuild from 'esbuild'

const isDev = process.argv.includes('--dev')

async function compile(options) {
    const context = await esbuild.context(options)

    if (isDev) {
        await context.watch()
    } else {
        await context.rebuild()
        await context.dispose()
    }
}

const defaultOptions = {
    define: {
        'process.env.NODE_ENV': isDev ? `'development'` : `'production'`,
    },
    bundle: true,
    mainFields: ['module', 'main'],
    platform: 'browser',
    sourcemap: isDev ? 'inline' : false,
    sourcesContent: isDev,
    treeShaking: true,
    loader: { '.png': 'dataurl' },
    target: ['es2022'],
    minify: !isDev,
    plugins: [{
        name: 'watchPlugin',
        setup: function (build) {
            build.onStart(() => {
                console.log(`Build started at ${new Date(Date.now()).toLocaleTimeString()}: ${build.initialOptions.outfile}`)
            })

            build.onEnd((result) => {
                if (result.errors.length > 0) {
                    console.log(`Build failed at ${new Date(Date.now()).toLocaleTimeString()}: ${build.initialOptions.outfile}`, result.errors)
                } else {
                    console.log(`Build finished at ${new Date(Date.now()).toLocaleTimeString()}: ${build.initialOptions.outfile}`)
                }
            })
        }
    }],
}

compile({
    ...defaultOptions,
    entryPoints: ['./resources/js/critters.js'],
    outfile: './resources/dist/critters.js',
}).then(() => console.log('Compile finished.'))

compile({
    ...defaultOptions,
    entryPoints: ['./resources/css/critters.css'],
    outfile: './resources/dist/critters.css',
}).then(() => console.log('Compile finished.'))

for (const creature of ['cat', 'fish']) {
    compile({
        ...defaultOptions,
        entryPoints: [`./resources/css/creatures/${creature}.css`],
        outfile: `./resources/dist/creatures/${creature}.css`,
    }).then(() => console.log('Compile finished.'))
}
