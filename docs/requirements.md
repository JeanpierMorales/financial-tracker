#Requerimientos funcionales

RF01 - Registrar ingresos: El sistema debe permitir registrar los ingresos de dinero indicando monto, fecha, descripción y método de pago utilizado.

RF02 - Registrar gastos: El sistema debe permitir registrar los gastos realizados indicando monto, fecha, descripción, categoría y método de pago utilizado.

RF03 - Gestionar movimientos: El sistema debe permitir consultar, editar y eliminar los ingresos y gastos registrados para mantener actualizada la información financiera.

RF04 - Consultar historial de movimientos: El sistema debe permitir visualizar el historial de ingresos y gastos registrados, mostrando la información relevante de cada movimiento.

RF05 - Filtrar movimientos: El sistema debe permitir filtrar los movimientos registrados según criterios como rango de fechas, categoría y método de pago.

RF06 - Gestionar categorías: El sistema debe permitir clasificar los gastos utilizando categorías como universidad, transporte, comida, entretenimiento, ropa, tecnología y otros.

RF07 - Consultar saldo disponible: El sistema debe calcular y mostrar el dinero disponible considerando el presupuesto o saldo inicial, los ingresos registrados y los gastos realizados.

RF08 - Visualizar resumen financiero: El sistema debe mostrar un resumen de la situación financiera para un período determinado, incluyendo ingresos, gastos, balance y saldo disponible.

RF09 - Visualizar distribución de gastos: El sistema debe mostrar la distribución de los gastos según sus categorías para identificar en qué conceptos se concentra el dinero utilizado.

RF10 - Comparar períodos: El sistema debe permitir comparar los ingresos y gastos correspondientes a diferentes períodos, principalmente semanas y meses.

RF11 - Visualizar evolución financiera: El sistema debe representar gráficamente la evolución de los ingresos, gastos y saldo a través del tiempo.

RF12 - Gestionar presupuesto: El sistema debe permitir establecer un presupuesto para un período determinado y mostrar cuánto dinero se ha utilizado y cuánto permanece disponible.

#Requerimientos no funcionales

RNF01 - Usabilidad: El sistema debe proporcionar una interfaz sencilla e intuitiva que permita registrar un ingreso o gasto de forma rápida y con pocos pasos.

RNF02 - Seguridad: El sistema debe proteger la información financiera y restringir el acceso a los datos únicamente al usuario autorizado.

RNF03 - Integridad de datos: El sistema debe validar la información ingresada para evitar registros inconsistentes, como montos inválidos o campos obligatorios incompletos.

RNF04 - Disponibilidad: El sistema debe permitir consultar y registrar información financiera siempre que el usuario disponga de conexión a Internet.

RNF05 - Persistencia: Los movimientos registrados deben almacenarse de manera permanente para que puedan ser consultados posteriormente.

RNF06 - Consistencia: Los cálculos relacionados con ingresos, gastos, saldo y presupuesto deben mantenerse consistentes cada vez que se registre, modifique o elimine un movimiento.

RNF07 - Rendimiento: Las operaciones principales, como registrar movimientos, consultar el historial y cargar el dashboard, deben ejecutarse en un tiempo adecuado para proporcionar una experiencia fluida.