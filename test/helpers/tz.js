// Moet als eerste geïmporteerd worden: de app rekent (nog) in lokale tijd, en de fixtures
// komen van een school in Nederland. Zo geven de tests op elke machine (ook CI op UTC)
// dezelfde uitkomst.
process.env.TZ = process.env.ROWIZER_TEST_TZ || "Europe/Amsterdam"
