// De app logt veel naar de console; in de tests alleen tonen met ROWIZER_TEST_LOG=1.
if (process.env.ROWIZER_TEST_LOG !== "1") {
    for (const level of ["log", "info", "warn", "error", "debug"]) {
        console[level] = () => {}
    }
}
