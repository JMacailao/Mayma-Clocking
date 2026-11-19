# Loading form accuracy check

Measures how well AvilonX reads real photos of the AvilonX loading form, so a
change to the reader can be checked against real handwriting before it ships.

```bash
node tools/form-accuracy/run.mjs              # photos in tests/forms
node tools/form-accuracy/run.mjs path/to/photos --min 0.95
```

For each photo (`name.jpg` or `name.png`) add `name.json` with what is really
written on it:

```json
{
  "settings": { "memberBoxes": 5, "prefixBoxes": 0, "numberBoxes": 8, "remarks": ["P1"] },
  "members": ["11001", "252"],
  "rings": { "11001": ["11235461"] },
  "rows": [ { "row": "1", "member": "11001", "ring": "11235461", "remarks": "P1" } ]
}
```

- `settings`: the club's Loading form settings and remarks when it was
  printed (forms with the form code carry their box counts themselves).
- `members` and `rings` (optional): the registered members and their bonded
  rings, as AvilonX would have them. With them, the check also measures
  matching. Add a few members that are not on the form too: that is what
  matching has to tell apart.
- `rows`: only the rows that are filled in.

It prints each field as read and after matching, the rows that went wrong,
and a score; `--min` makes it fail below that score (for use before a merge).
