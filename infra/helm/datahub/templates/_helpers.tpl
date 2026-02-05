{{- define "datahub.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datahub.fullname" -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "datahub.backendName" -}}
{{- printf "%s-backend" (include "datahub.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datahub.backendFullname" -}}
{{- printf "%s-backend" (include "datahub.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datahub.frontendName" -}}
{{- printf "%s-frontend" (include "datahub.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datahub.frontendFullname" -}}
{{- printf "%s-frontend" (include "datahub.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
