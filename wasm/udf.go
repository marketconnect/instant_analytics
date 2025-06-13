// udf.go
package main

import (
	"fmt"
	"strings"
	"syscall/js"
)

// sanitizeField escapes double quotes in a string to prevent SQL injection.
// DuckDB allows double quotes.
func sanitizeField(v string) string {
	// заменяем " → ""
	return `"` + strings.ReplaceAll(v, `"`, `""`) + `"`
}

/*
genSQL builds example SQL for "Top-N":

	SELECT "<column>", COUNT(*) AS cnt
	FROM   "<table>"
	GROUP  BY 1
	ORDER  BY cnt DESC
	LIMIT  20;

Export it to JS:
*/
func genSQL(this js.Value, args []js.Value) any {
	if len(args) != 2 {
		return js.ValueOf(`SELECT 1`) // fallback
	}
	table := sanitizeField(args[0].String())
	column := sanitizeField(args[1].String())

	sql := fmt.Sprintf(`
		SELECT %s, COUNT(*) AS cnt
		FROM   %s
		GROUP  BY 1
		ORDER  BY cnt DESC
		LIMIT  20;
	`, column, table)

	return js.ValueOf(sql)
}

func main() {
	// Export the function to JS: genSQL("t", "customer_id") → SQL string
	js.Global().Set("genSQL", js.FuncOf(genSQL))
	select {} // block main to prevent exit
}
