const path = require('path');
const { tests } = require('@iobroker/testing');
const expect = require('chai').expect;
const TestServer = require('./server/ph803w');

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    //            ~~~~~~~~~~~~~~~~~~~~~~~~~
    // This should be the adapter's root directory

    // If the adapter may call process.exit during startup, define here which exit codes are allowed.
    // By default, termination during startup is not allowed.
    allowedExitCodes: [11],

    // Define your own tests inside defineAdditionalTests
    // Since the tests are heavily instrumented, you need to create and use a so called "harness" to control the tests.
    defineAdditionalTests(getHarness) {
        describe('PHP803W tests', () => {
            it('States created and have values', () => {
                return new Promise(async (resolve) => {
                    const server = new TestServer();
                    await server.open();

                    // Create a fresh harness instance each test!
                    const harness = getHarness();
                    // Start the adapter and wait until it has started
                    await harness.startAdapterAndWait();

                    harness.on('stateChange', async (id, state) => {
                        if (id === 'ph803w.0.info.connection' && state && state.val === true) {
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.ph')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.ph.value')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.ph.outlet')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.redox')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.redox.value')).to.be.true;
                            expect(await harness.objects.objectExists('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.redox.outlet')).to.be.true;

                            setTimeout(async () => {
                                expect((await harness.states.getStateAsync('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.ph.value')).val).to.be.above(7);
                                expect((await harness.states.getStateAsync('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.redox.value')).val).to.be.above(200);
                                expect(typeof (await harness.states.getStateAsync('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.redox.outlet')).val).to.equal('boolean');
                                expect(typeof (await harness.states.getStateAsync('ph803w.0.CFqpJTSymCE9PLlp1DpbhY.ph.outlet')).val).to.equal('boolean');

                                await server.close();
                                resolve(true);
                            }, 2000);
                        }
                    });
                });
            }).timeout(5000);
        });
    },
});
