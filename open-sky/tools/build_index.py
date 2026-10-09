"""Pre-builds the Overture row-group bbox index (cached under .cache/)."""
import sys
from concurrent.futures import ThreadPoolExecutor
import overture as o

themes = [a.split("/") for a in sys.argv[1:]] or [["buildings", "building"]]
for theme, typ in themes:
    files = o.list_files(theme, typ)
    with ThreadPoolExecutor(12) as ex:
        list(ex.map(o._footer_index, files))
    print(theme, typ, "indexed", len(files))
