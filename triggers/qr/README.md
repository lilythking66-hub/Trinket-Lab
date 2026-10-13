# QR Trigger

Optional trigger adapter for Trinket Lab components.

For the Instant Photo family its job is intentionally small:

~~~text
scan → resolve payload → build photo recipe → call Instant Photo
~~~

The QR implementation must remain removable. Instant Photo and Photo Engine must work without it.
