import { format } from "date-fns";
import { useShowAlerts } from 'dhis2-semis-functions';
import useGetSelectedKeys from "../config/useGetSelectedKeys";
import { getProgramNames, useGetEvents, useSectionProfile, useUploadEvents, useUrlParams } from "dhis2-semis-functions"
import { useGetUsedProgramStages, useSchoolCalendarKey } from "dhis2-semis-components";

export function usePromoteStudents({ selected, setOpen, setStats, setOpenPerform, setLoading }: { setLoading: (args: boolean) => void, setOpenPerform: any, setStats: (args: any) => void, selected: any[], setOpen: (args: boolean) => void }) {
    const { getEvents } = useGetEvents()
    const { urlParameters } = useUrlParams();
    const { school, sectionType } = urlParameters;
    const { uploadValues } = useUploadEvents()
    const { show } = useShowAlerts()
    const { promotionChoosesOrgUnit, promotionSkipsExistingYear } = useSectionProfile()
    const schoolCalendar = useSchoolCalendarKey()
    const { dataStoreData, program: programData } = useGetSelectedKeys()
    const programStagesToUse = useGetUsedProgramStages({ sectionType: sectionType as any })

    async function promote(values: any) {
        setLoading(true)
        try {
        let enrollments: any[] = []
        let registrationEvent: any = []
        let date = format(new Date(), 'yyyy-MM-dd')
        const socioEconomicPStage = dataStoreData["socio-economics"]?.programStage

        const orgUnit = promotionChoosesOrgUnit ? values.registeringSchool : school;

        const { registeringSchool, enrollment_date, ...registrationValues } = values
        for (const key in registrationValues) {
            registrationEvent.push({
                dataElement: key,
                value: registrationValues[key]
            })
        }

        const returnEventStructure = (stage: string, datavalues: any[]) => {
            return { occurredAt: date, notes: [], status: "ACTIVE", program: programData?.id, programStage: stage, orgUnit, scheduledAt: date, dataValues: datavalues }
        }

        for (const tei of selected) {
            const checkAlreadyPromoted = !promotionSkipsExistingYear
                ? []
                : await getEvents({ program: tei.programId, fields: "*", trackedEntities: tei.trackedEntity, programStage: dataStoreData.registration.programStage, filter: [`${schoolCalendar?.academicYear}:in:${values?.[schoolCalendar?.academicYear]}`] })

            if (!Array.isArray(checkAlreadyPromoted)) throw new Error('Could not check existing enrollments. Please try again.')
            if (checkAlreadyPromoted.length === 0) {
                let events = []
                let socioEconomicDataValues: any = []

                const socioEconomicEvent = await getEvents({ program: tei.programId, fields: "*", trackedEntities: tei.trackedEntity, programStage: socioEconomicPStage })
                if (!Array.isArray(socioEconomicEvent)) throw new Error('Could not load the enrollment details. Please try again.')
                const event = socioEconomicEvent?.find((x: any) => x.enrollment === tei.enrollmentId)

                if (event) {
                    event?.dataValues.forEach((dataValue: any) => {
                        socioEconomicDataValues.push({
                            dataElement: dataValue?.dataElement,
                            value: dataValue?.value
                        })
                    })

                    events.push(returnEventStructure(socioEconomicPStage, socioEconomicDataValues))
                }

                events.push(returnEventStructure(dataStoreData.registration.programStage, registrationEvent))

                programStagesToUse.forEach(programStage => {
                    events.push(returnEventStructure(programStage, []))
                })

                enrollments.push(
                    {
                        trackedEntity: tei.trackedEntity,
                        trackedEntityType: dataStoreData.trackedEntityType,
                        orgUnit,
                        attributes: tei.attributes || [],
                        enrollments: [
                            {
                                occurredAt: date,
                                enrolledAt: values.enrollment_date,
                                program: programData?.id,
                                orgUnit,
                                status: "COMPLETED",
                                events: events
                            }
                        ]
                    })
            } else setStats((prev: any) => ({ ...prev, conflicts: [...prev.conflicts, tei] }))
        }

        if (enrollments.length) await uploadValues({ trackedEntities: enrollments }, 'COMMIT', 'CREATE_AND_UPDATE', { errorMessage: "Could not complete promotion", names: getProgramNames(programData) })

        setStats((prev: any) => ({ ...prev, posted: enrollments.length }))
        setOpenPerform(false)
        setLoading(false)
        setOpen(true)
        } catch (error: any) {
            show({ message: error?.message ?? 'Could not complete promotion. Please try again.', type: { critical: true } })
        } finally {
            setLoading(false)
        }
    }

    return { promote }
}
