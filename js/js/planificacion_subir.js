const rutaLibro = await subirArchivo(
    archivoLibro,
    "libro.pdf"
);

const rutaPrograma = await subirArchivo(
    archivoPrograma,
    "programa.pdf"
);

mostrarEstado(
    "Comprobando el PDF del programa..."
);

const {
    data: resultadoPrograma,
    error: errorPrograma,
} = await supabase.functions.invoke(
    "parsear-programa",
    {
        body: {
            pathPrograma: rutaPrograma,
        },
    }
);

if (errorPrograma) {
    throw new Error(
        "Error al comprobar el programa: " +
        (
            errorPrograma.message ||
            "La función Edge respondió con error."
        )
    );
}

if (!resultadoPrograma || !resultadoPrograma.ok) {
    throw new Error(
        resultadoPrograma?.error ||
        "No se pudo comprobar el PDF del programa."
    );
}

console.info(
    "✅ Programa descargado por la función Edge:",
    resultadoPrograma.archivo
);

mostrarEstado(
    "Programa verificado. Analizando el libro..."
);
